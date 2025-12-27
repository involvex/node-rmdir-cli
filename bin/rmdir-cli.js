#!/usr/bin/env node

"use strict";
var rmdir = require("../index");
var version = require("../package.json").version;
var fs = require("fs");
var path = require("path");

// Parse command line arguments
function parseArgs() {
  var args = process.argv.slice(2);
  var options = {
    force: false,
    yes: false,
    help: false,
    version: false,
    directories: [],
  };

  for (var i = 0; i < args.length; i++) {
    var arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg.startsWith("-")) {
      console.error("Unknown option: " + arg);
      showUsage();
      process.exit(1);
    } else {
      options.directories.push(arg);
    }
  }

  return options;
}

// Show usage information
function showUsage() {
  console.log("Usage: rmdir [options] <dir> [dir2 ...]");
  console.log("");
  console.log("Options:");
  console.log("  -h, --help     output usage information");
  console.log("  -v, --version  output the version number");
  console.log(
    "  -f, --force    enable recursive deletion of non-empty directories",
  );
  console.log(
    "  -y, --yes      skip confirmation prompts (non-interactive mode)",
  );
  console.log("");
  console.log("Examples:");
  console.log("  rmdir mydir                    # Delete empty directory");
  console.log(
    "  rmdir --force mydir           # Delete non-empty directory with confirmation",
  );
  console.log(
    "  rmdir --force --yes mydir     # Delete non-empty directory without confirmation",
  );
  console.log("  rmdir --force dir1 dir2 dir3  # Delete multiple directories");
}

// Show version information
function showVersion() {
  console.log("rmdir-cli version: " + version);
}

// Check if directory exists and is accessible
function checkDirectory(dirpath) {
  try {
    var stats = fs.statSync(dirpath);
    if (!stats.isDirectory()) {
      console.error("Error: " + dirpath + " is not a directory");
      return false;
    }
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error("Error: Directory '" + dirpath + "' does not exist");
      return false;
    } else if (err.code === "EACCES") {
      console.error("Error: Permission denied accessing '" + dirpath + "'");
      return false;
    } else {
      console.error(
        "Error: Unable to access '" + dirpath + "': " + err.message,
      );
      return false;
    }
  }
}

// Check if directory is empty
function isDirectoryEmpty(dirpath) {
  try {
    var files = fs.readdirSync(dirpath);
    return files.length === 0;
  } catch (ignoreErr) {
    console.log("Error:", ignoreErr);
    return false;
  }
}

// Get directory size for progress indication
function getDirectorySize(dirpath) {
  var totalSize = 0;
  var totalFiles = 0;

  function walkDir(currentPath) {
    try {
      var files = fs.readdirSync(currentPath);
      files.forEach(function (file) {
        var filePath = path.join(currentPath, file);
        var stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
          walkDir(filePath);
        } else {
          totalSize += stats.size;
          totalFiles++;
        }
      });
    } catch (calcErr) {
      console.log("Error:", calcErr);
      // Ignore errors when calculating size
    }
  }

  walkDir(dirpath);
  return { size: totalSize, files: totalFiles };
}

// Confirm deletion with user
function confirmDeletion(dirpath, options) {
  if (options.yes) {
    return Promise.resolve(true);
  }

  var readline = require("readline");
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(function (resolve) {
    var sizeInfo = getDirectorySize(dirpath);
    var sizeMB = (sizeInfo.size / (1024 * 1024)).toFixed(2);

    console.log("About to delete: " + dirpath);
    console.log(
      "Directory contains: " + sizeInfo.files + " files, " + sizeMB + " MB",
    );
    console.log("");

    rl.question(
      "Are you sure you want to delete this directory? [y/N]: ",
      function (answer) {
        rl.close();
        var confirmed =
          answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
        if (!confirmed) {
          console.log("Operation cancelled.");
        }
        resolve(confirmed);
      },
    );
  });
}

// Enhanced rmdir function with progress and confirmation
function rmdirWithConfirmation(dirpath, options) {
  return new Promise(function (resolve, reject) {
    if (!checkDirectory(dirpath)) {
      reject(new Error("Directory check failed"));
      return;
    }

    var isEmpty = isDirectoryEmpty(dirpath);

    if (!isEmpty && !options.force) {
      console.error("Error: Directory '" + dirpath + "' is not empty.");
      console.error("Use --force to delete non-empty directories.");
      reject(new Error("Directory not empty"));
      return;
    }

    if (!isEmpty) {
      confirmDeletion(dirpath, options)
        .then(function (confirmed) {
          if (!confirmed) {
            resolve(false);
            return;
          }

          console.log("Deleting directory: " + dirpath);
          try {
            rmdir(dirpath);
            console.log("Successfully deleted: " + dirpath);
            resolve(true);
          } catch (err) {
            console.error(
              "Error deleting directory '" + dirpath + "': " + err.message,
            );
            reject(err);
          }
        })
        .catch(function (err) {
          reject(err);
        });
    } else {
      try {
        rmdir(dirpath);
        console.log("Successfully deleted: " + dirpath);
        resolve(true);
      } catch (err) {
        console.error(
          "Error deleting directory '" + dirpath + "': " + err.message,
        );
        reject(err);
      }
    }
  });
}

// Main execution
var options = parseArgs();

if (options.help) {
  showUsage();
  process.exit(0);
} else if (options.version) {
  showVersion();
  process.exit(0);
} else if (options.directories.length === 0) {
  console.error("Error: No directory specified");
  showUsage();
  process.exit(1);
} else {
  // Process each directory
  var promises = options.directories.map(function (dirpath) {
    return rmdirWithConfirmation(dirpath, options);
  });

  Promise.all(promises)
    .then(function (results) {
      var successCount = results.filter(Boolean).length;
      var totalCount = results.length;

      if (successCount === totalCount) {
        console.log("\nAll directories deleted successfully.");
        process.exit(0);
      } else {
        console.log(
          "\n" +
            successCount +
            " out of " +
            totalCount +
            " directories deleted successfully.",
        );
        process.exit(1);
      }
    })
    .catch(function (err) {
      console.error("Operation failed:", err.message);
      process.exit(1);
    });
}
