import chalk from "chalk";
import fsExtra from "fs-extra";
import os from "os";
import path from "path";

import { HARDHAT_NAME } from "../constants";
import { DEFAULT_SOLC_VERSION } from "../core/config/default-config";
import { HardhatError } from "../core/errors";
import { ERRORS } from "../core/errors-list";
import { getRecommendedGitIgnore } from "../core/project-structure";
import {
  hasConsentedTelemetry,
  writeTelemetryConsent,
} from "../util/global-dir";
import { fromEntries } from "../util/lang";
import { getPackageJson, getPackageRoot } from "../util/packageInfo";
import { Dependencies } from "../../types/cli";
import {
  confirmRecommendedDepsInstallation,
  confirmTelemetryConsent,
  confirmProjectCreation,
} from "./prompt";

import { emoji } from "./emoji";

enum Action {
  CREATE_BASIC_SAMPLE_PROJECT_ACTION = "Create a basic sample project",
  CREATE_ADVANCED_SAMPLE_PROJECT_ACTION = "Create an advanced sample project",
  CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION = "Create an advanced sample project that uses TypeScript",
  CREATE_EMPTY_HARDHAT_CONFIG_ACTION = "Create an empty hardhat.config.js",
  QUIT_ACTION = "Quit",
}

type SampleProjectTypeCreationAction =
  | Action.CREATE_BASIC_SAMPLE_PROJECT_ACTION
  | Action.CREATE_ADVANCED_SAMPLE_PROJECT_ACTION
  | Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION;

const HARDHAT_PACKAGE_NAME = "hardhat";

const BASIC_SAMPLE_PROJECT_DEPENDENCIES: Dependencies = {
  "@nomiclabs/hardhat-waffle": "^2.0.0",
  "ethereum-waffle": "^3.0.0",
  chai: "^4.2.0",
  "@nomiclabs/hardhat-ethers": "^2.0.0",
  ethers: "^5.0.0",
};

const ADVANCED_SAMPLE_PROJECT_DEPENDENCIES: Dependencies = {
  ...BASIC_SAMPLE_PROJECT_DEPENDENCIES,
  "@nomiclabs/hardhat-etherscan": "^3.0.0",
  dotenv: "^16.0.0",
  eslint: "^7.29.0",
  "eslint-config-prettier": "^8.3.0",
  "eslint-config-standard": "^16.0.3",
  "eslint-plugin-import": "^2.23.4",
  "eslint-plugin-node": "^11.1.0",
  "eslint-plugin-prettier": "^3.4.0",
  "eslint-plugin-promise": "^5.1.0",
  "hardhat-gas-reporter": "^1.0.4",
  prettier: "^2.3.2",
  "prettier-plugin-solidity": "^1.0.0-beta.13",
  solhint: "^3.3.6",
  "solidity-coverage": "^0.7.16",
};

const ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_DEPENDENCIES: Dependencies = {
  ...ADVANCED_SAMPLE_PROJECT_DEPENDENCIES,
  "@typechain/ethers-v5": "^7.0.1",
  "@typechain/hardhat": "^2.3.0",
  "@typescript-eslint/eslint-plugin": "^4.29.1",
  "@typescript-eslint/parser": "^4.29.1",
  "@types/chai": "^4.2.21",
  "@types/node": "^12.0.0",
  "@types/mocha": "^9.0.0",
  "ts-node": "^10.1.0",
  typechain: "^5.1.2", // a workaround. see https://github.com/nomiclabs/hardhat/issues/1672#issuecomment-894497156
  typescript: "^4.5.2",
};

const SAMPLE_PROJECT_DEPENDENCIES: {
  [K in SampleProjectTypeCreationAction]: Dependencies;
} = {
  [Action.CREATE_BASIC_SAMPLE_PROJECT_ACTION]:
    BASIC_SAMPLE_PROJECT_DEPENDENCIES,
  [Action.CREATE_ADVANCED_SAMPLE_PROJECT_ACTION]:
    ADVANCED_SAMPLE_PROJECT_DEPENDENCIES,
  [Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION]:
    ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_DEPENDENCIES,
};

async function removeProjectDirIfPresent(projectRoot: string, dirName: string) {
  const dirPath = path.join(projectRoot, dirName);
  if (await fsExtra.pathExists(dirPath)) {
    await fsExtra.remove(dirPath);
  }
}

async function removeTempFilesIfPresent(projectRoot: string) {
  await removeProjectDirIfPresent(projectRoot, "cache");
  await removeProjectDirIfPresent(projectRoot, "artifacts");
}

// generated with the "colossal" font
function printAsciiLogo() {
  console.log(
    chalk.blue("888    888                      888 888               888")
  );
  console.log(
    chalk.blue("888    888                      888 888               888")
  );
  console.log(
    chalk.blue("888    888                      888 888               888")
  );
  console.log(
    chalk.blue("8888888888  8888b.  888d888 .d88888 88888b.   8888b.  888888")
  );
  console.log(
    chalk.blue('888    888     "88b 888P"  d88" 888 888 "88b     "88b 888')
  );
  console.log(
    chalk.blue("888    888 .d888888 888    888  888 888  888 .d888888 888")
  );
  console.log(
    chalk.blue("888    888 888  888 888    Y88b 888 888  888 888  888 Y88b.")
  );
  console.log(
    chalk.blue('888    888 "Y888888 888     "Y88888 888  888 "Y888888  "Y888')
  );
  console.log("");
}

async function printWelcomeMessage() {
  const packageJson = await getPackageJson();

  console.log(
    chalk.cyan(
      `${emoji("👷 ")}Welcome to ${HARDHAT_NAME} v${packageJson.version}${emoji(
        " 👷‍"
      )}\n`
    )
  );
}

async function checkForDuplicates(
  projectRoot: string,
  projectType: SampleProjectTypeCreationAction
): Promise<void> {
  const { intersection, union } = await import("lodash");

  const packageRoot = getPackageRoot();

  const srcPath = path.join(packageRoot, "sample-projects");
  const destFiles = fsExtra.readdirSync(projectRoot);
  let srcFiles: string[] = fsExtra.readdirSync(path.join(srcPath, "basic"));

  switch (projectType) {
    case Action.CREATE_ADVANCED_SAMPLE_PROJECT_ACTION:
      srcFiles = union(
        srcFiles,
        fsExtra.readdirSync(path.join(srcPath, "advanced"))
      );
      break;
    case Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION:
      srcFiles = union(
        srcFiles,
        fsExtra.readdirSync(path.join(srcPath, "advanced")),
        fsExtra.readdirSync(path.join(srcPath, "advanced-ts"))
      );
      break;
  }

  const duplicates = intersection(srcFiles, destFiles);

  if (duplicates.length > 0) {
    throw new HardhatError(ERRORS.GENERAL.CONFLICTING_FILES, {
      dest: projectRoot,
      conflicts: duplicates.map((n) => `  ${n}`).join(os.EOL),
    });
  }
}

async function copySampleProject(
  projectRoot: string,
  projectType: SampleProjectTypeCreationAction
) {
  const packageRoot = getPackageRoot();

  // first copy the basic project, then, if an advanced project is what was
  // requested, overlay the advanced files on top of the basic ones. then, if
  // the advanced TypeScript project is what was requested, overlay those files
  // on top of the advanced ones.

  await checkForDuplicates(projectRoot, projectType);

  await fsExtra.ensureDir(projectRoot);
  await fsExtra.copy(
    path.join(packageRoot, "sample-projects", "basic"),
    projectRoot
  );

  if (
    projectType === Action.CREATE_ADVANCED_SAMPLE_PROJECT_ACTION ||
    projectType === Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION
  ) {
    await fsExtra.copy(
      path.join(packageRoot, "sample-projects", "advanced"),
      projectRoot
    );
    await fsExtra.remove(path.join(projectRoot, "scripts", "sample-script.js"));
    await fsExtra.move(
      path.join(projectRoot, "npmignore"),
      path.join(projectRoot, ".npmignore"),
      { overwrite: true }
    );
  }

  if (projectType === Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION) {
    await fsExtra.copy(
      path.join(packageRoot, "sample-projects", "advanced-ts"),
      projectRoot
    );
    for (const jsFile of [
      "hardhat.config.js",
      path.join("scripts", "deploy.js"),
      path.join("test", "sample-test.js"),
    ]) {
      await fsExtra.remove(jsFile);
    }
    await fsExtra.move(
      path.join(projectRoot, "npmignore"),
      path.join(projectRoot, ".npmignore"),
      { overwrite: true }
    );
  }

  // This is just in case we have been using the sample project for dev/testing
  await removeTempFilesIfPresent(projectRoot);

  await fsExtra.remove(path.join(projectRoot, "LICENSE.md"));
}

async function addGitIgnore(projectRoot: string) {
  const gitIgnorePath = path.join(projectRoot, ".gitignore");

  let content = await getRecommendedGitIgnore();

  if (await fsExtra.pathExists(gitIgnorePath)) {
    const existingContent = await fsExtra.readFile(gitIgnorePath, "utf-8");
    content = `${existingContent}
${content}`;
  }

  await fsExtra.writeFile(gitIgnorePath, content);
}

async function printRecommendedDepsInstallationInstructions(
  projectType: SampleProjectTypeCreationAction
) {
  console.log(
    `You need to install these dependencies to run the sample project:`
  );

  const cmd = await getRecommendedDependenciesInstallationCommand(
    await getDependencies(projectType)
  );

  console.log(`  ${cmd.join(" ")}`);
}

async function writeEmptyHardhatConfig() {
  return fsExtra.writeFile(
    "hardhat.config.js",
    `/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "${DEFAULT_SOLC_VERSION}",
};
`,
    "utf-8"
  );
}

async function getAction(): Promise<Action> {
  if (
    process.env.HARDHAT_CREATE_BASIC_SAMPLE_PROJECT_WITH_DEFAULTS !== undefined
  ) {
    return Action.CREATE_BASIC_SAMPLE_PROJECT_ACTION;
  } else if (
    process.env.HARDHAT_CREATE_ADVANCED_SAMPLE_PROJECT_WITH_DEFAULTS !==
    undefined
  ) {
    return Action.CREATE_ADVANCED_SAMPLE_PROJECT_ACTION;
  } else if (
    process.env
      .HARDHAT_CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_WITH_DEFAULTS !==
    undefined
  ) {
    return Action.CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_ACTION;
  }

  const { default: enquirer } = await import("enquirer");
  try {
    const actionResponse = await enquirer.prompt<{ action: string }>([
      {
        name: "action",
        type: "select",
        message: "What do you want to do?",
        initial: 0,
        choices: Object.values(Action).map((a: Action) => {
          return { name: a, message: a, value: a };
        }),
      },
    ]);

    if ((Object.values(Action) as string[]).includes(actionResponse.action)) {
      return actionResponse.action as Action;
    } else {
      throw new HardhatError(ERRORS.GENERAL.UNSUPPORTED_OPERATION, {
        operation: `Responding with "${actionResponse.action}" to the project initialization wizard`,
      });
    }
  } catch (e) {
    if (e === "") {
      return Action.QUIT_ACTION;
    }

    // eslint-disable-next-line @nomiclabs/hardhat-internal-rules/only-hardhat-error
    throw e;
  }
}

async function createPackageJson() {
  await fsExtra.writeJson(
    "package.json",
    {
      name: "hardhat-project",
    },
    { spaces: 2 }
  );
}

export async function createProject() {
  printAsciiLogo();

  await printWelcomeMessage();

  const action = await getAction();

  if (action === Action.QUIT_ACTION) {
    return;
  }

  if (!(await fsExtra.pathExists("package.json"))) {
    await createPackageJson();
  }

  if (action === Action.CREATE_EMPTY_HARDHAT_CONFIG_ACTION) {
    await writeEmptyHardhatConfig();
    console.log(
      `${emoji("✨ ")}${chalk.cyan(`Config file created`)}${emoji(" ✨")}`
    );

    if (!isInstalled(HARDHAT_PACKAGE_NAME)) {
      console.log("");
      console.log(`You need to install hardhat locally to use it. Please run:`);
      const cmd = await getRecommendedDependenciesInstallationCommand({
        [HARDHAT_PACKAGE_NAME]: `^${(await getPackageJson()).version}`,
      });

      console.log("");
      console.log(cmd.join(" "));
      console.log("");
    }

    return;
  }

  let responses: {
    projectRoot: string;
    shouldAddGitIgnore: boolean;
  };

  const useDefaultPromptResponses =
    process.env.HARDHAT_CREATE_BASIC_SAMPLE_PROJECT_WITH_DEFAULTS !==
      undefined ||
    process.env.HARDHAT_CREATE_ADVANCED_SAMPLE_PROJECT_WITH_DEFAULTS !==
      undefined ||
    process.env
      .HARDHAT_CREATE_ADVANCED_TYPESCRIPT_SAMPLE_PROJECT_WITH_DEFAULTS !==
      undefined;

  if (useDefaultPromptResponses) {
    responses = {
      projectRoot: process.cwd(),
      shouldAddGitIgnore: true,
    };
  } else {
    try {
      responses = await confirmProjectCreation();
    } catch (e) {
      if (e === "") {
        return;
      }

      // eslint-disable-next-line @nomiclabs/hardhat-internal-rules/only-hardhat-error
      throw e;
    }
  }

  const { projectRoot, shouldAddGitIgnore } = responses;

  await copySampleProject(projectRoot, action);

  if (shouldAddGitIgnore) {
    await addGitIgnore(projectRoot);
  }

  if (hasConsentedTelemetry() === undefined) {
    const telemetryConsent = await confirmTelemetryConsent();

    if (telemetryConsent !== undefined) {
      writeTelemetryConsent(telemetryConsent);
    }
  }

  let shouldShowInstallationInstructions = true;

  if (await canInstallRecommendedDeps()) {
    const dependencies = await getDependencies(
      action as SampleProjectTypeCreationAction /* type cast feels okay here
      because we already returned from this function if it isn't valid. */
    );

    const recommendedDeps = Object.keys(dependencies);

    const dependenciesToInstall = fromEntries(
      Object.entries(dependencies).filter(([name]) => !isInstalled(name))
    );

    const installedRecommendedDeps = recommendedDeps.filter(isInstalled);
    const installedExceptHardhat = installedRecommendedDeps.filter(
      (name) => name !== HARDHAT_PACKAGE_NAME
    );

    if (installedRecommendedDeps.length === recommendedDeps.length) {
      shouldShowInstallationInstructions = false;
    } else if (installedExceptHardhat.length === 0) {
      const shouldInstall =
        useDefaultPromptResponses ||
        (await confirmRecommendedDepsInstallation(dependenciesToInstall));
      if (shouldInstall) {
        const installed = await installRecommendedDependencies(
          dependenciesToInstall
        );

        if (!installed) {
          console.warn(
            chalk.red("Failed to install the sample project's dependencies")
          );
        }

        shouldShowInstallationInstructions = !installed;
      }
    }
  }

  if (shouldShowInstallationInstructions) {
    console.log(``);
    await printRecommendedDepsInstallationInstructions(action);
  }

  console.log(
    `\n${emoji("✨ ")}${chalk.cyan("Project created")}${emoji(" ✨")}`
  );

  console.log("See the README.md file for some example tasks you can run.");
}

async function canInstallRecommendedDeps() {
  return (
    (await fsExtra.pathExists("package.json")) &&
    // TODO: Figure out why this doesn't work on Win
    // cf. https://github.com/nomiclabs/hardhat/issues/1698
    os.type() !== "Windows_NT"
  );
}

function isInstalled(dep: string) {
  const packageJson = fsExtra.readJSONSync("package.json");

  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.optionalDependencies,
  };

  return dep in allDependencies;
}

export async function isYarnProject() {
  return fsExtra.pathExists("yarn.lock");
}

async function installRecommendedDependencies(dependencies: Dependencies) {
  console.log("");

  // The reason we don't quote the dependencies here is because they are going
  // to be used in child_process.sapwn, which doesn't require escaping string,
  // and can actually fail if you do.
  const installCmd = await getRecommendedDependenciesInstallationCommand(
    dependencies,
    false
  );
  return installDependencies(installCmd[0], installCmd.slice(1));
}

async function installDependencies(
  packageManager: string,
  args: string[]
): Promise<boolean> {
  const { spawn } = await import("child_process");

  console.log(`${packageManager} ${args.join(" ")}`);

  const childProcess = spawn(packageManager, args, {
    stdio: "inherit" as any, // There's an error in the TS definition of ForkOptions
  });

  return new Promise((resolve, reject) => {
    childProcess.once("close", (status) => {
      childProcess.removeAllListeners("error");

      if (status === 0) {
        resolve(true);
        return;
      }

      reject(false);
    });

    childProcess.once("error", (_status) => {
      childProcess.removeAllListeners("close");
      reject(false);
    });
  });
}

async function getRecommendedDependenciesInstallationCommand(
  dependencies: Dependencies,
  quoteDependencies = true
): Promise<string[]> {
  const deps = Object.entries(dependencies).map(([name, version]) =>
    quoteDependencies ? `"${name}@${version}"` : `${name}@${version}`
  );

  if (await isYarnProject()) {
    return ["yarn", "add", "--dev", ...deps];
  }

  return ["npm", "install", "--save-dev", ...deps];
}

async function getDependencies(projectType: SampleProjectTypeCreationAction) {
  return {
    [HARDHAT_PACKAGE_NAME]: `^${(await getPackageJson()).version}`,
    ...SAMPLE_PROJECT_DEPENDENCIES[projectType],
  };
}
