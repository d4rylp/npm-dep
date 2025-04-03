# NPM Dependency Manager

An intuitive Electron desktop app designed specifically for quickly managing, checking, and updating your project's global and local NPM dependencies.

## ✨ Features

- 📌 Manage **global and local NPM dependencies** from a user-friendly interface.
- 📂 Quickly scan directories for projects containing `package.json` files.
- ⚙️ Clearly separate **production** and **development** dependencies.
- ✅ Easily update all or selectively chosen dependencies.
- 🌗 Supports **Light**, **Dark**, and **System** theme modes.
- 🔐 Secure, native OS prompts (`sudo`) for installing global updates.

## 📥 Installation

### Prerequisites
- Node.js version 16.x or higher is required.
- Git
- Supported OS: Windows, macOS, Linux

### Setup
```bash
git clone https://github.com/d4rylp/npm-dep.git
cd npm-pkg
npm install
```

## 🚀 Running the Application

To launch in development mode:

```bash
npm run start
```

This command:
- Compiles TypeScript files.
- Copies the HTML and CSS files to the build directory.
- Starts the Electron app.

## 🎯 Usage Guide

1. Click **"Pick Folder"** to select the directory you wish to manage.
2. The application scans the chosen folder and identifies projects with `package.json`.
3. Review dependencies, check current vs. latest versions, and perform updates:
   - Update **all dependencies** at once.
   - Or update **selected dependencies** individually.
4. Use the theme selector to switch between Light, Dark, or System themes.

## 📂 Project Structure

```plaintext
src/
├── app/          # Frontend HTML and CSS
│   ├── index.html
│   └── styles.css
├── utils/        # Electron backend logic
│   ├── main.ts
│   └── preload.ts
dist/             # Compiled files output
package.json      # Project dependencies and scripts
tsconfig.json     # TypeScript configuration
```

## ⚙️ Scripts

Available scripts in `package.json`:

```json
{
  "compile": "tsc",
  "copy-html-css": "cp -r src/app dist/app",
  "start": "npm run compile && npm run copy-html-css && electron .",
  "build": "npm run compile && npm run copy-html-css && electron-builder"
}
```

## 🖥️ Electron IPC API

The application uses Electron's Inter-Process Communication (IPC) for backend-frontend interaction.

### Renderer API (`window.api`)

- `pickFolder()`
- `getFolders(basePath)`
- `checkUpdates(folderPath, isDev)`
- `installUpdates(folderPath, isDev)`
- `installSpecificUpdates(folderPath, deps[], isDev)`
- `checkGlobalUpdates()`
- `installGlobalUpdates()`
- `installSpecificGlobalUpdates(deps[])`

## 🛠️ Technologies & Libraries

- [Electron](https://www.electronjs.org/)
- [npm-check-updates](https://www.npmjs.com/package/npm-check-updates)
- [fast-glob](https://www.npmjs.com/package/fast-glob)
- [sudo-prompt](https://www.npmjs.com/package/sudo-prompt)
- [fix-path](https://www.npmjs.com/package/fix-path)

## 🔒 Permissions & Security

Some operations, particularly global dependency updates, require administrative privileges. These are securely managed with `sudo-prompt` which invokes native OS prompts for elevated permissions.

## ⚠️ Limitations

- Currently supports only NPM-based projects (not compatible with Yarn, pnpm, etc.).
- Assumes managed projects adhere strictly to having a `package.json` file.
- Global updates may fail silently if permission requests are denied.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

Developed with ❤️ by Daryl Peter.