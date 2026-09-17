/**
 * Memory Maze Browser - Geschütztes Google Apps Script Backend
 * 
 * Deployment URL:
 * https://script.google.com/macros/s/AKfycbzmdYR7Uqz4Kid4faxd63F54cXZAdLIAXOXGNX-EtjiX1NoE710C1-o94r5waXQzL9g/exec
 */

var DRIVE_FOLDER_ID = "1RyAOeKrt8pj-5qrZ97n0GqBn4xYDoslz"; 
var VALID_SIZES = ["9x9", "11x11", "13x13", "15x15"];

function setupSheetHeader(sheet) {
  var headers = [
    "timestamp",
    "participant_id",
    "maze_size",
    "maze_seed",
    "time_scale",
    "time_limit_seconds",
    "elapsed_seconds",
    "score",
    "finish_reason",
    "classic_controls",
    "retro_view",
    "practice_mode",
    "invert_y",
    "mouse_sensitivity",
    "path_points",
    "trajectory_url"
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: "active", message: "Memory Maze Collector is online!" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    // 1. Spam-Schutz: Maximale Dateigröße 2 MB (ein 16-Minuten 15x15 Run hat nur ~75 KB)
    if (!e.postData || !e.postData.contents || e.postData.contents.length > 2000000) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload too large" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);

    // 2. Auth-Schutz: Muss pseudonymisierter Google-Nutzer sein
    var participantId = data.participant_id || data.user_id;
    if (!participantId || participantId === "anonymous") {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Auth required" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Validierungs-Schutz: Nur echte Spiel-Daten akzeptieren
    var mazeSize = data.maze_size || data.size;
    var mazeSeed = data.maze_seed !== undefined ? data.maze_seed : data.seed;
    var timeLimit = data.time_limit_seconds !== undefined ? data.time_limit_seconds : data.time_limit;
    var reason = data.finish_reason || data.reason || "";

    if (!VALID_SIZES.includes(mazeSize) || typeof data.score !== "number" || !Array.isArray(data.path)) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid game payload" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      setupSheetHeader(sheet);
    }

    var driveUrl = "";
    if (DRIVE_FOLDER_ID && data.path.length > 0) {
      try {
        var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        var filename = participantId.replace(/[^a-zA-Z0-9_-]/g, "_") + 
                       "_" + mazeSize + "_seed" + (mazeSeed !== undefined ? mazeSeed : "0") + "_" + Date.now() + ".json";
        var file = folder.createFile(filename, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
        driveUrl = file.getUrl();
      } catch (driveErr) {
        driveUrl = "Drive error: " + driveErr.message;
      }
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      participantId,
      mazeSize,
      mazeSeed !== undefined ? mazeSeed : "",
      data.time_scale !== undefined ? data.time_scale : "",
      timeLimit !== undefined ? timeLimit : "",
      data.elapsed_seconds !== undefined ? data.elapsed_seconds : "",
      data.score !== undefined ? data.score : 0,
      reason,
      data.classic_controls ? "TRUE" : "FALSE",
      data.retro_view ? "TRUE" : "FALSE",
      data.practice_mode ? "TRUE" : "FALSE",
      data.invert_y ? "TRUE" : "FALSE",
      data.mouse_sensitivity !== undefined ? data.mouse_sensitivity : "",
      data.path.length,
      driveUrl
    ]);

    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
