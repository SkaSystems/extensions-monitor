var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("passwords");

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var activationSheet = ss.getSheetByName("activation");
  var isActive = activationSheet ? (activationSheet.getRange("B1").getValue() === true) : false;

  var blacklist = readColumnA(ss, "blacklist");
  var whitelist = readColumnA(ss, "whitelist");

  return ContentService
    .createTextOutput(JSON.stringify({ isActive: isActive, blacklist: blacklist, whitelist: whitelist }))
    .setMimeType(ContentService.MimeType.JSON);
}

function readColumnA(ss, sheetName) {
  var s = ss.getSheetByName(sheetName);
  if (!s) return [];
  var lastRow = s.getLastRow();
  if (lastRow < 2) return [];
  var values = s.getRange(2, 1, lastRow - 1, 1).getValues();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i][0];
    if (v !== null && v !== undefined) {
      var trimmed = String(v).trim();
      if (trimmed.length > 0) result.push(trimmed);
    }
  }
  return result;
}

function doPost(e) {
  let userData = sheet.getDataRange().getValues();
  if(e.postData) {
    const reqdata = JSON.parse(e.postData.contents);
    let email = reqdata.email;
    let password = reqdata.password;
    for(var i = 1; i < userData.length; i++) {
      if(String(userData[i][0]) === String(email) && String(userData[i][1]) === String(password)) {
        // now verify license validity and type
        let startdate = Date.parse(userData[i][2]);
        let enddate = Date.parse(userData[i][3]);
        let license = userData[i][2];
        if(new Date() < enddate && new Date() > startdate) {
          // send valid + license type
          return ContentService
                  .createTextOutput(JSON.stringify({ 'authenticated': 1, 'validity': 1, 'license': license, 'error': '0'}))
                  .setMimeType(ContentService.MimeType.JSON);
        } else {
          // send invalid
          return ContentService
                  .createTextOutput(JSON.stringify({ 'authenticated': 1,'validity': 0, 'license': license, 'error': '0'}))
                  .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }
    return ContentService
        .createTextOutput(JSON.stringify({ 'authenticated': 0, 'validity': 0, 'license': 'none', 'error': 'Not authenticated'}))
        .setMimeType(ContentService.MimeType.JSON);
  } else {
        return ContentService
        .createTextOutput(JSON.stringify({ 'authenticated': 0, 'validity': 0, 'license': 'none', 'error': 'Request missing arguments' }))
        .setMimeType(ContentService.MimeType.JSON);
  }
}
