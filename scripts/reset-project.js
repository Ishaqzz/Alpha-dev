#!/usr/bin/env node

/**
 * reset-project.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resets the project back to a blank Expo starter state.
 * Run with:  node scripts/reset-project.js
 *
 * Moved from example/scripts/ → scripts/ as part of project structure cleanup.
 * All paths are resolved relative to the project root (process.cwd() / __dirname)
 * so the script works on any machine or drive.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Project-root-relative paths ───────────────────────────────────────────────
const root        = path.join(__dirname, '..');   // project root = one level up from scripts/
const oldDirs     = ['src', 'scripts'];
const exampleDir  = 'example';
const newAppDir   = 'src/app';
const exampleDirPath = path.join(root, exampleDir);

// ── Blank-slate file contents ─────────────────────────────────────────────────
const indexContent = `import { Text, View, StyleSheet } from 'react-native';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Edit src/app/index.tsx to edit this screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
`;

const layoutContent = `import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
`;

// ── Interactive prompt ────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const moveDirectories = async (userInput) => {
  try {
    if (userInput === 'y') {
      await fs.promises.mkdir(exampleDirPath, { recursive: true });
      console.log(`📁 /${exampleDir} directory created.`);
    }

    for (const dir of oldDirs) {
      const oldDirPath = path.join(root, dir);
      if (fs.existsSync(oldDirPath)) {
        if (userInput === 'y') {
          const newDirPath = path.join(root, exampleDir, dir);
          await fs.promises.rename(oldDirPath, newDirPath);
          console.log(`➡️  /${dir} moved to /${exampleDir}/${dir}.`);
        } else {
          await fs.promises.rm(oldDirPath, { recursive: true, force: true });
          console.log(`❌ /${dir} deleted.`);
        }
      } else {
        console.log(`➡️  /${dir} does not exist, skipping.`);
      }
    }

    // Create new blank src/app
    const newAppDirPath = path.join(root, newAppDir);
    await fs.promises.mkdir(newAppDirPath, { recursive: true });
    console.log('\n📁 New /src/app directory created.');

    await fs.promises.writeFile(path.join(newAppDirPath, 'index.tsx'), indexContent);
    console.log('📄 src/app/index.tsx created.');

    await fs.promises.writeFile(path.join(newAppDirPath, '_layout.tsx'), layoutContent);
    console.log('📄 src/app/_layout.tsx created.');

    console.log('\n✅ Project reset complete. Next steps:');
    console.log(
      `1. Run \`npx expo start\` to start a development server.\n` +
      `2. Edit src/app/index.tsx to edit the main screen.\n` +
      `3. Put all your application code in /src; only screens/layouts go in /src/app.` +
      (userInput === 'y' ? `\n4. Delete the /${exampleDir} directory when you're done referencing it.` : '')
    );
  } catch (error) {
    console.error(`❌ Error during script execution: ${error.message}`);
  }
};

rl.question(
  "Do you want to move existing files to /example instead of deleting them? (Y/n): ",
  (answer) => {
    const userInput = answer.trim().toLowerCase() || 'y';
    if (userInput === 'y' || userInput === 'n') {
      moveDirectories(userInput).finally(() => rl.close());
    } else {
      console.log("❌ Invalid input. Please enter 'Y' or 'N'.");
      rl.close();
    }
  }
);
