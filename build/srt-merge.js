#!/usr/bin/env deno --allow-env --allow-read --allow-write

// scripts/merge-script.js
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// node_modules/subtitle/dist/subtitle.esm.js
var padLeft = function padLeft2(value, length) {
  if (length === void 0) {
    length = 2;
  }
  return value.toString().padStart(length, "0");
};
function formatTimestamp(timestamp, options) {
  if (options === void 0) {
    options = {
      format: "srt"
    };
  }
  var date = new Date(0, 0, 0, 0, 0, 0, timestamp);
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var seconds = date.getSeconds();
  var ms = timestamp - (hours * 36e5 + minutes * 6e4 + seconds * 1e3);
  return padLeft(hours) + ":" + padLeft(minutes) + ":" + padLeft(seconds) + (options.format === "vtt" ? "." : ",") + padLeft(ms, 3);
}
function _extends() {
  _extends = Object.assign || function(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          target[key] = source[key];
        }
      }
    }
    return target;
  };
  return _extends.apply(this, arguments);
}
function parseTimestamp(timestamp) {
  var match = timestamp.match(/^(?:(\d{1,}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) {
    throw new Error('Invalid SRT or VTT time format: "' + timestamp + '"');
  }
  var hours = match[1] ? parseInt(match[1], 10) * 36e5 : 0;
  var minutes = parseInt(match[2], 10) * 6e4;
  var seconds = parseInt(match[3], 10) * 1e3;
  var milliseconds = parseInt(match[4], 10);
  return hours + minutes + seconds + milliseconds;
}
var RE_TIMESTAMP = /^((?:\d{1,}:)?\d{2}:\d{2}[,.]\d{3}) --> ((?:\d{1,}:)?\d{2}:\d{2}[,.]\d{3})(?: (.*))?$/;
function parseTimestamps(value) {
  var match = RE_TIMESTAMP.exec(value);
  if (!match) {
    throw new Error("Invalid timestamp format");
  }
  var timestamp = {
    start: parseTimestamp(match[1]),
    end: parseTimestamp(match[2])
  };
  if (match[3]) {
    timestamp.settings = match[3];
  }
  return timestamp;
}
var normalize = function normalize2(str) {
  return str.trim().concat("\n").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^WEBVTT.*\n(?:.*: .*\n)*\n/, "").split("\n");
};
var isIndex = function isIndex2(str) {
  return /^\d+$/.test(str.trim());
};
var isTimestamp = function isTimestamp2(str) {
  return RE_TIMESTAMP.test(str);
};
var throwError = function throwError2(expected, index, row) {
  throw new Error("expected " + expected + " at row " + (index + 1) + ", but received " + row);
};
function parse(input) {
  var source = normalize(input);
  var state = {
    expect: "index",
    caption: {
      start: 0,
      end: 0,
      text: ""
    },
    captions: []
  };
  source.forEach(function(row, index) {
    if (state.expect === "index") {
      state.expect = "timestamp";
      if (isIndex(row)) {
        return;
      }
    }
    if (state.expect === "timestamp") {
      if (!isTimestamp(row)) {
        throwError("timestamp", index, row);
      }
      state.caption = _extends({}, state.caption, parseTimestamps(row));
      state.expect = "text";
      return;
    }
    if (state.expect === "text") {
      if (isTimestamp(source[index + 1])) {
        state.expect = "timestamp";
        state.captions.push(state.caption);
        state.caption = {
          start: 0,
          end: 0,
          text: ""
        };
        return;
      }
      var isLastRow = index === source.length - 1;
      var isNextRowCaption = isIndex(source[index + 1] || "") && isTimestamp(source[index + 2]);
      if (isLastRow || isNextRowCaption) {
        state.expect = "index";
        state.captions.push(state.caption);
        state.caption = {
          start: 0,
          end: 0,
          text: ""
        };
      } else {
        state.caption.text = state.caption.text ? state.caption.text + "\n" + row : row;
      }
    }
  });
  return state.captions;
}
function resync(captions, time) {
  return captions.map(function(caption) {
    return _extends({}, caption, {
      start: caption.start + time,
      end: caption.end + time
    });
  });
}
function stringify(captions, options) {
  if (options === void 0) {
    options = {
      format: "srt"
    };
  }
  var isVTT = options.format === "vtt";
  return (isVTT ? "WEBVTT\n\n" : "") + captions.map(function(caption, index) {
    return (index > 0 ? "\n" : "") + [
      index + 1,
      formatTimestamp(caption.start, options) + " --> " + formatTimestamp(caption.end, options) + (isVTT && caption.settings ? " " + caption.settings : ""),
      caption.text
    ].join("\n");
  }).join("\n") + "\n";
}

// merge.js
function merge(srtPrimary, srtSecondary, attrs, noString) {
  if (typeof srtPrimary === "string") {
    srtPrimary = srtPrimary !== "" ? parse(srtPrimary) : [];
  }
  if (typeof srtSecondary === "string") {
    srtSecondary = srtSecondary !== "" ? parse(srtSecondary) : [];
  }
  if (typeof srtPrimary !== "object" || typeof srtSecondary !== "object") {
    throw new Error("cannot parse srt file");
  }
  if (attrs) {
    if (typeof attrs === "string") {
      attrs = [
        attrs
      ];
    }
    attrs.sort((attr1, attr2) => {
      const order = [
        "s",
        "t",
        "m",
        "n"
      ];
      return order.indexOf(attr1[0]) - order.indexOf(attr2[0]);
    });
    attrs.forEach((attr2) => {
      if (attr2) {
        attr2 = attr2.trim();
      }
      if (attr2 === "top-bottom") {
        srtPrimary = clearPosition(srtPrimary);
        srtSecondary = clearPosition(srtSecondary);
        srtSecondary.forEach((caption) => {
          caption.text = "{\\an8}" + caption.text;
        });
      } else if (/^nearest-cue-[0-9]+(-no-append)?$/.test(attr2)) {
        const threshold = parseInt(attr2.substring(attr2.lastIndexOf("cue-") + 4));
        const srtPrimaryTimeArray = srtPrimary.map((caption) => caption.start);
        const noAppend = attr2.indexOf("-no-append") > -1;
        const append = function(captionA, captionB) {
          if (noAppend) {
            captionB.start = captionA.start;
            if (Math.abs(captionB.end - captionA.end) <= threshold) {
              captionB.end = captionA.end;
            }
            return captionB;
          } else {
            captionA.text = captionA.text + "\n" + captionB.text;
            return void 0;
          }
        };
        srtPrimary = copySrt(srtPrimary);
        srtSecondary = srtSecondary.map((caption) => {
          let index = binarySearch(caption.start, srtPrimaryTimeArray);
          if (index === -1) {
            if (srtPrimary[0].start - caption.start <= threshold) {
              return append(srtPrimary[0], caption);
            } else {
              return caption;
            }
          } else if (caption.start - srtPrimary[index].start <= threshold) {
            return append(srtPrimary[index], caption);
          } else if (index === srtPrimary.length - 1) {
            return caption;
          } else if (srtPrimary[index + 1].start - caption.start <= threshold) {
            return append(srtPrimary[index + 1], caption);
          } else {
            return caption;
          }
        }).filter((caption) => caption !== void 0);
      } else if (/^move-[-]?[0-9]+$/.test(attr2)) {
        const delay = parseInt(attr2.substring(attr2.lastIndexOf("e-") + 2));
        srtSecondary = resync(srtSecondary, delay);
      } else if (attr2 !== void 0 && attr2 !== "simple" && attr2 !== "") {
        throw new Error("Cannot parse attr");
      }
    });
  }
  let srt3 = srtPrimary.concat(srtSecondary);
  srt3.sort((caption1, caption2) => {
    return caption1.start - caption2.start;
  });
  return noString ? srt3 : stringify(srt3);
}
function clearPosition(srt) {
  return srt.map((caption) => {
    caption = Object.assign({}, caption);
    caption.text = caption.text.replace(/{\\a[n]?[0-9]}/g, "");
    caption.text = caption.text.replace(/{\\pos\([0-9]+,[0-9]+\)}/g, "");
    return caption;
  });
}
function copySrt(srt) {
  return srt.map((caption) => Object.assign({}, caption));
}
function binarySearch(value, array, comp) {
  let left = 0, right = array.length;
  while (right > left) {
    let mid = Math.floor((left + right) / 2);
    let result2;
    if (comp) {
      result2 = comp(array[mid], value);
    } else {
      result2 = array[mid] < value ? -1 : array[mid] > value ? 1 : 0;
    }
    if (result2 === 0) {
      return mid;
    }
    if (result2 < 0) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left - 1;
}

// scripts/merge-script.js
if (process.argv.length < 3 || process.argv[2] === "--help" || process.argv[2] === "-h") {
  console.log("Usage:");
  console.log("  srt-merge.js <srtFilepath 1> [<srtFilepath 2>] [<one-attr>] [-o [-f(force)] <outputFilepath>]");
  console.log("Description:");
  console.log("  Srt 2 will be processed by given attributes and merged into Srt 1.");
  console.log("Attributes available:");
  console.log("  1. top-bottom \n    # This will make srt2 showed at top and srt1 showed at bottom.");
  console.log("  2. nearest-cue-<time-in-millisecond>[-no-append] \n    # This will append srt2 lines into srt1 lines within given time threshold.");
  console.log("  3. move-<time-to-shift> \n    # This will move srt2, number can be positive or negative in milliseconds.");
  console.log("Input files:");
  console.log("  Both srt files should be encoded in utf-8.");
  process.exit(0);
}
var argv = process.argv.slice(2);
argv.reverse();
var files = [argv.pop(), argv.pop()];
if (!existsSync(files[1])) {
  argv.push(files[1]);
  files[1] = files[0];
  files[0] = "";
}
var srts = files.map((file) => file.trim().length > 0 ? readFileSync(file, "utf-8") : "");
var attr = void 0;
if (argv[argv.length - 1][0] !== "-") {
  attr = argv.pop();
}
var output = void 0;
var force = false;
if (argv[argv.length - 1] === "-o" || argv[argv.length - 1] === "-of" || argv[argv.length - 1] === "-fo") {
  if (argv[argv.length - 1] === "-of" || argv[argv.length - 1] === "-fo") {
    force = true;
  }
  argv.pop();
  if (argv[argv.length - 1] === "-f") {
    force = true;
    argv.pop();
  }
  output = argv.pop();
}
var result = merge(srts[0], srts[1], attr);
if (output) {
  if (force || !existsSync(output)) {
    writeFileSync(output, result);
    console.log("Successfully written.");
    process.exit(0);
  } else {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question("File '" + output + "' already exists, overwrite? [y/N] ", (answer) => {
      answer = answer.toLowerCase();
      if (answer[0] === "y") {
        writeFileSync(output, result);
        console.log("Successfully written.");
      } else {
        console.log("Abort.");
      }
      process.exit(0);
    });
  }
} else {
  console.log(result);
  process.exit(0);
}
