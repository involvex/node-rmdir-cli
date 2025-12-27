#!/usr/bin/env node

"use strict";
var rmdir = require("../index");
var version = require("../package.json").version;

if (process.argv[2] == "--help" || process.argv[2] == "-h") {
  console.log("Usage: rmdir <dir>");
  console.log("rmdir <dir> - Recursively removes a directory.");
  process.exit(0);
} else if (process.argv[2] == "--version" || process.argv[2] == "-v") {
  console.log(version);
  process.exit(0);
} else {
  if (process.argv[2]) {
    rmdir(process.argv[2]);
  }
}
