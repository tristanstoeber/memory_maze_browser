/**
 * Memory Maze Browser - Geschütztes Google Apps Script Backend
 * 
 * Deployment URL:
 * https://script.google.com/macros/s/AKfycbzxr6XSGg8OXWeEjstLUSDUVTrm19uVor7m-1KJOHiJf-JPl5oNtkEZ4slvhXf_5ZHx/exec
 */

var DRIVE_FOLDER_ID = "1RyAOeKrt8pj-5qrZ97n0GqBn4xYDoslz"; 
var VALID_SIZES = ["9x9", "11x11", "13x13", "15x15"];

function setupSheetHeader(sheet) {
  var headers = [
    "Timestamp", "User Name", "User Email", "User ID", "Maze Size",
    "Maze Seed", "Time Scale", "Time Limit (s)", "Elapsed (s)", "Score",
    "Reason", "Classic Controls", "Retro View", "Practice Mode",
    "Invert Y", "Mouse Sensitivity", "Path Points", "Trajectory File URL"
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

    // 2. Auth-Schutz: Muss eingeloggter Google-Nutzer sein
    if (!data.user_id || data.user_id === "anonymous") {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Auth required" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Validierungs-Schutz: Nur echte Spiel-Daten akzeptieren
    if (!VALID_SIZES.includes(data.size) || typeof data.score !== "number" || !Array.isArray(data.path)) {
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
        var filename = (data.user_name || "player").replace(/[^a-zA-Z0-9_-]/g, "_") + 
                       "_" + data.size + "_seed" + data.seed + "_" + Date.now() + ".json";
        var file = folder.createFile(filename, JSON.stringify(data, null, 2), MimeType.PLAIN_TEXT);
        driveUrl = file.getUrl();
      } catch (driveErr) {
        driveUrl = "Drive error: " + driveErr.message;
      }
    }

    sheet.appendRow([
      data.timestamp || new Date().toISOString(),
      data.user_name || "anonymous",
      data.user_email || "",
      data.user_id || "",
      data.size || "",
      data.seed !== undefined ? data.seed : "",
      data.time_scale !== undefined ? data.time_scale : "",
      data.time_limit !== undefined ? data.time_limit : "",
      data.elapsed_seconds !== undefined ? data.elapsed_seconds : "",
      data.score !== undefined ? data.score : 0,
      data.reason || "",
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
