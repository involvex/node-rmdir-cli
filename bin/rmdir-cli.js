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
    brutal: false,
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
    } else if (arg === "--brutal" || arg === "-b") {
      options.brutal = true;
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
    "  -b, --brutal   kill running processes in directory before deletion",
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
    "  rmdir --brutal mydir          # Kill processes and delete directory with confirmation",
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

// Get processes using files in directory
function getProcessesUsingDirectory(dirpath) {
  return new Promise(function (resolve) {
    var processes = [];
    
    try {
      var os = require("os");
      var child_process = require("child_process");
      
      if (os.platform() === "win32") {
        // Windows: use handle.exe or tasklist with open files
        try {
          var result = child_process.execSync(
            'handle.exe "' + dirpath + '" 2>nul || echo "handle.exe not found"',
            { encoding: "utf8", timeout: 5000 }
          );
          
          if (!result.includes("handle.exe not found")) {
            // Parse handle.exe output
            var lines = result.split("\n");
            lines.forEach(function (line) {
              if (line.includes("pid:")) {
                var match = line.match(/pid:\s*(\d+)/);
                if (match) {
                  processes.push({
                    pid: parseInt(match[1]),
                    name: "Unknown"
                  });
                }
              }
            });
          }
        } catch (ignoreErr) { // eslint-disable-line no-unused-vars
          // Fallback to tasklist approach
          try {
            var tasklistResult = child_process.execSync(
              'tasklist /V /FO CSV | findstr /I "' + dirpath + '"',
              { encoding: "utf8", timeout: 5000 }
            );
            
            if (tasklistResult.trim()) {
              var tasklistLines = tasklistResult.split("\n");
              tasklistLines.forEach(function (line) {
                var parts = line.split(",");
                if (parts.length >= 2) {
                  var name = parts[0].replace(/"/g, "");
                  var pid = parseInt(parts[1].replace(/"/g, ""));
                  processes.push({ pid: pid, name: name });
                }
              });
            }
          } catch (ignoreErr2) { // eslint-disable-line no-unused-vars
            // Ignore errors
          }
        }
      } else {
        // Unix-like systems: use lsof
        try {
          var lsofResult = child_process.execSync(
            'lsof +D "' + dirpath + '" 2>/dev/null || true',
            { encoding: "utf8", timeout: 5000 }
          );
          
          if (lsofResult.trim()) {
            var lsofLines = lsofResult.split("\n");
            lsofLines.forEach(function (line) {
              var parts = line.split(/\s+/);
              if (parts.length >= 2 && !isNaN(parseInt(parts[1]))) {
                processes.push({
                  pid: parseInt(parts[1]),
                  name: parts[0]
                });
              }
            });
          }
        } catch (ignoreErr3) { // eslint-disable-line no-unused-vars
          // Ignore errors
        }
      }
    } catch (ignoreErr4) { // eslint-disable-line no-unused-vars
      // Ignore all errors and return empty array
    }
    
    // Remove duplicates
    var uniqueProcesses = [];
    var seenPids = new Set();
    
    processes.forEach(function (proc) {
      if (!seenPids.has(proc.pid)) {
        seenPids.add(proc.pid);
        uniqueProcesses.push(proc);
      }
    });
    
    resolve(uniqueProcesses);
  });
}

// Kill processes using directory
function killProcesses(processes) {
  return new Promise(function (resolve, reject) {
    var killed = [];
    var failed = [];
    
    var os = require("os");
    var child_process = require("child_process");
    
    processes.forEach(function (proc) {
      try {
        if (os.platform() === "win32") {
          child_process.execSync('taskkill /PID ' + proc.pid + ' /F', { timeout: 3000 });
        } else {
          child_process.execSync('kill -9 ' + proc.pid, { timeout: 3000 });
        }
        killed.push(proc);
      } catch (killErr) {
        failed.push({ process: proc, error: killErr.message });
      }
    });
    
    if (failed.length > 0) {
      reject({
        killed: killed,
        failed: failed
      });
    } else {
      resolve(killed);
    }
  });
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
    
    if (options.brutal) {
      console.log("Brutal mode enabled: Running processes will be killed");
      console.log("");
      rl.question(
        "Are you sure you want to delete this directory and kill running processes? [y/N]: ",
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
    } else {
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
    }
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

    if (!isEmpty && !options.force && !options.brutal) {
      console.error("Error: Directory '" + dirpath + "' is not empty.");
      console.error("Use --force or --brutal to delete non-empty directories.");
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

          // Handle brutal mode - kill processes first
          if (options.brutal) {
            console.log("Checking for running processes in directory...");
            return getProcessesUsingDirectory(dirpath)
              .then(function (processes) {
                if (processes.length > 0) {
                  console.log("Found " + processes.length + " running process(es):");
                  processes.forEach(function (proc) {
                    console.log("  PID " + proc.pid + ": " + proc.name);
                  });
                  
                  console.log("Attempting to kill processes...");
                  return killProcesses(processes)
                    .then(function (killed) {
                      console.log("Successfully killed " + killed.length + " process(es)");
                      return true;
                    })
                    .catch(function (killResult) {
                      console.log("Warning: Could not kill all processes");
                      if (killResult.killed.length > 0) {
                        console.log("  Successfully killed: " + killResult.killed.length + " process(es)");
                      }
                      if (killResult.failed.length > 0) {
                        console.log("  Failed to kill: " + killResult.failed.length + " process(es)");
                        killResult.failed.forEach(function (failed) {
                          console.log("    PID " + failed.process.pid + ": " + failed.error);
                        });
                      }
                      return true; // Continue with deletion anyway
                    });
                } else {
                  console.log("No running processes found in directory");
                  return true;
                }
              })
              .catch(function (procErr) {
                console.log("Warning: Could not check for running processes: " + procErr.message);
                return true; // Continue with deletion anyway
              });
          } else {
            return Promise.resolve(true);
          }
        })
        .then(function () {
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
