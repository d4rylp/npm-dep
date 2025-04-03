import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { exec, ExecException } from 'child_process';
import fg from 'fast-glob';
import sudo from 'sudo-prompt';
import fixPath from 'fix-path';
import { run as ncuRun } from 'npm-check-updates';

// Ensure we can find `npm` (especially on macOS).
fixPath();


/**
 * Create the main browser window
 */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      // Update path if your preload file is now preload.ts (compiled to preload.js).
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, '../app/index.html'));
}

/**
 * Define the structure of folders returned by `get-folders`.
 */
interface FolderItem {
  packageName: string | null;
  relativePath: string;
  fullPath: string;
}

/**
 * Shape of return object for "check-updates" & similar calls.
 */
interface UpdateResult {
  [packageName: string]: string;
}
interface ErrorResult {
  _error: true;
  message: string;
}

/**
 * Register all IPC handlers, but only once.
 * This ensures we don’t add multiple listeners for the same channels.
 */
function registerIpcHandlers(): void {
  // If we've already registered them, skip re-registration.
  if ((ipcMain as any)._myIpcRegistered) return;
  (ipcMain as any)._myIpcRegistered = true;

  /**
   * IPC: Pick folder (opens a system dialog)
   */
  ipcMain.handle('pick-folder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  });

  /**
   * IPC: Return list of folders containing a package.json.
   */
  ipcMain.handle(
    'get-folders',
    async (event: IpcMainInvokeEvent, basePath?: string): Promise<FolderItem[]> => {
      const dirToScan = basePath ?? process.cwd();

      // Look for every package.json under dirToScan (excluding node_modules)
      const packageJsonPaths: string[] = await fg(['**/package.json'], {
        cwd: dirToScan,  
        onlyFiles: true,
        ignore: ['**/node_modules/**']
      });

      const folders: FolderItem[] = [];
      for (const relativeFilePath of packageJsonPaths) {
        const absoluteFilePath = path.join(dirToScan, relativeFilePath);
        const absoluteFolderPath = path.dirname(absoluteFilePath);
        const relativeFolderPath = path.dirname(relativeFilePath);

        let packageName: string | null = null;
        try {
          const raw = fs.readFileSync(absoluteFilePath, 'utf8');
          const pkg = JSON.parse(raw);
          if (pkg.name) {
            packageName = pkg.name;
          }
        } catch {
          // If parsing fails, just ignore
        }

        folders.push({
          packageName,
          relativePath: relativeFolderPath,
          fullPath: absoluteFolderPath,
        });
      }

      // Deduplicate by absolute folder path
      const uniqueFolders: FolderItem[] = [];
      const seen = new Set();
      for (const f of folders) {
        if (!seen.has(f.fullPath)) {
          seen.add(f.fullPath);
          uniqueFolders.push(f);
        }
      }

      return uniqueFolders;
    }
  );

  /**
   * IPC: Check local project updates using npm-check-updates
   */
  ipcMain.handle(
    'check-updates',
    async (
      event: IpcMainInvokeEvent,
      folderPath: string,
      isDev: boolean
    ): Promise<UpdateResult | ErrorResult> => {
      try {
        // Read existing package.json
        const pkgFile = path.join(folderPath, 'package.json');
        const pkgData = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
        const depKey = isDev ? 'devDependencies' : 'dependencies';
        const oldDeps = pkgData[depKey] || {};

        // Programmatically run npm-check-updates (do NOT modify package.json here)
        const rawResult = await ncuRun({
          cwd: folderPath,
          dep: isDev ? 'dev' : 'prod',
          jsonUpgraded: true,
          upgrade: false
        });

        const upgradedDeps: Record<string, string> =
          rawResult && typeof rawResult === 'object'
            ? (rawResult as Record<string, string>)
            : {};

        // Create display object: { depName: "oldVersion -> newVersion" }
        const updates: UpdateResult = {};
        for (const [depName, newVersion] of Object.entries(upgradedDeps)) {
          const currentVersion = oldDeps[depName] || '???';
          updates[depName] = `${currentVersion} → ${newVersion}`;
        }

        return updates;
      } catch (err: any) {
        console.error(`Error checking updates in ${folderPath}:`, err);
        return { _error: true, message: err.message };
      }
    }
  );

  /**
   * IPC: Install ALL updates in a local folder
   */
  ipcMain.handle(
    'install-updates',
    async (
      event: IpcMainInvokeEvent,
      folderPath: string,
      isDev: boolean
    ): Promise<string | ErrorResult> => {
      try {
        // Bump versions in package.json
        await ncuRun({
          cwd: folderPath,
          dep: isDev ? 'dev' : 'prod',
          upgrade: true
        });

        // Then install updated deps
        await new Promise((resolve, reject) => {
          exec(
            `cd "${folderPath}" && npm install`,
            { encoding: 'utf8' },
            (err: ExecException | null, stdout: string, stderr: string) => {
              if (err) {
                console.error(`Install updates error in ${folderPath}:`, err);
                return reject(err);
              }
              if (stderr) {
                const msg = stderr.trim();
                if (msg) {
                  console.warn(`Install updates warning in ${folderPath}:`, msg);
                }
              }
              resolve(stdout);
            }
          );
        });

        return 'Done installing updates.';
      } catch (error: any) {
        console.error(`Error installing updates in ${folderPath}:`, error);
        return { _error: true, message: error.message };
      }
    }
  );

  /**
   * IPC: Install SPECIFIC updates in a local folder
   */
  ipcMain.handle(
    'install-specific-updates',
    async (
      event: IpcMainInvokeEvent,
      folderPath: string,
      filterList: string[],
      isDev: boolean
    ): Promise<string | ErrorResult> => {
      try {
        // Filter with ncu
        await ncuRun({
          cwd: folderPath,
          dep: isDev ? 'dev' : 'prod',
          upgrade: true,
          filter: filterList
        });

        // Then do npm install
        await new Promise((resolve, reject) => {
          exec(
            `cd "${folderPath}" && npm install`,
            { encoding: 'utf8' },
            (err: ExecException | null, stdout: string, stderr: string) => {
              if (err) {
                console.error(`install-specific-updates error in ${folderPath}:`, err);
                return reject(err);
              }
              if (stderr) {
                const msg = stderr.trim();
                if (msg) {
                  console.warn(`install-specific-updates warning in ${folderPath}:`, msg);
                }
              }
              resolve(stdout);
            }
          );
        });

        return 'Done installing specific updates.';
      } catch (error: any) {
        console.error(`Error installing specific updates in ${folderPath}:`, error);
        return { _error: true, message: error.message };
      }
    }
  );

  /**
   * IPC: Check GLOBAL updates
   */
  ipcMain.handle(
    'check-global-updates',
    async (): Promise<UpdateResult | ErrorResult> => {
      try {
        // 1. Ask npm-check-updates for the *latest* versions of global packages
        const rawResult = await ncuRun({
          global: true,
          jsonUpgraded: true,
          upgrade: false
        });
        const upgraded: Record<string, string> =
          rawResult && typeof rawResult === 'object'
            ? (rawResult as Record<string, string>)
            : {};
  
        // 2. Get the *currently installed* global packages
        const installedStr = await new Promise<string>((resolve, reject) => {
          exec('npm ls -g --depth=0 --json', (err, stdout) => {
            // Note: `npm ls` often exits with non-zero even if it’s “fine,”
            // so we usually just read stdout and ignore the error code:
            if (!stdout) {
              return reject(
                new Error('Could not read output from npm ls -g --depth=0 --json')
              );
            }
            resolve(stdout);
          });
        });
  
        let installed: Record<string, any> = {};
        try {
          const parsed = JSON.parse(installedStr);
          installed = parsed.dependencies || {};
        } catch (err) {
          console.warn('Could not parse npm ls -g JSON output:', err);
        }
  
        // 3. Combine installed version with the new version from ncu
        const updates: UpdateResult = {};
        for (const [depName, newVersion] of Object.entries(upgraded)) {
          const currentVersion = installed[depName]?.version || '???';
          updates[depName] = `${currentVersion} → ${newVersion}`;
        }
  
        return updates;
      } catch (error: any) {
        console.error('ncu -g error (programmatic):', error);
        return { _error: true, message: error.message };
      }
    }
  );

  /**
   * IPC: Install ALL global updates
   */
/**
 * IPC: Install ALL global updates
 */
ipcMain.handle(
  'install-global-updates',
  async (): Promise<string | ErrorResult> => {
    try {
      // Bump versions in the global environment *and* retrieve which packages changed:
      const updatedDeps = await ncuRun({
        global: true,
        upgrade: true,
        jsonUpgraded: true, // <-- This is important so we can see which packages changed
      });

      // If no packages got updated, we can return early
      if (!updatedDeps || Object.keys(updatedDeps).length === 0) {
        return 'No global updates were found, or everything is already up-to-date.';
      }

      // The packages that ncu bumped
      const packagesToUpdate = Object.keys(updatedDeps);

      // Then actually install each package globally with sudo
      // (This step is crucial – `npm install -g` with no package names won’t do anything.)
      const installCmd = `npm install -g ${packagesToUpdate.join(' ')}`;

      await new Promise((resolve, reject) => {
        sudo.exec(
          installCmd,
          { name: 'NPM Update GUI' },
          (error, stdout, stderr) => {
            if (error) {
              return reject(error);
            }
            const outStr = typeof stdout === 'string' ? stdout : stdout?.toString() ?? '';
            const errStr = typeof stderr === 'string' ? stderr : stderr?.toString() ?? '';

            if (errStr.trim()) {
              console.warn('Global update warnings:', errStr.trim());
            }
            resolve(outStr);
          }
        );
      });

      return 'Done updating all global packages.';
    } catch (error: any) {
      console.error('Global update error:', error);
      return { _error: true, message: error.message };
    }
  }
);

  /**
   * IPC: Install SPECIFIC global updates
   */
  ipcMain.handle(
    'install-specific-global-updates',
    async (
      event: IpcMainInvokeEvent,
      deps: string[]
    ): Promise<string | ErrorResult> => {
      try {
        // Bump only listed packages globally
        await ncuRun({
          global: true,
          upgrade: true,
          filter: deps
        });

        // Then install them globally
        const installCmd = `npm install -g ${deps.join(' ')}`;
        await new Promise((resolve, reject) => {
          sudo.exec(
            installCmd,
            { name: 'NPM Update GUI' },
            (error, stdout, stderr) => {
              if (error) {
                return reject(error);
              }
              const outStr = typeof stdout === 'string'
                ? stdout
                : stdout?.toString() ?? '';
              const errStr = typeof stderr === 'string'
                ? stderr
                : stderr?.toString() ?? '';

              if (errStr.trim()) {
                console.warn('Global update warnings (specific):', errStr.trim());
              }
              resolve(outStr);
            }
          );
        });

        return 'Done updating selected global packages.';
      } catch (error: any) {
        console.error('Global update error (specific):', error);
        return { _error: true, message: error.message };
      }
    }
  );
}

// ----- MAIN STARTUP -----

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers(); // Register our IPC listeners just once
});

// (Optional) Quit when all windows are closed.  
// Adjust for macOS if desired. 
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});