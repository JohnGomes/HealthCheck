const
    request = require('request'),
    qs = require('querystring'),
    datastore = require("./datastore.js").async,
    dayCheck = require('./check_day.json'),
    projectCheck = require('./check_project.json'),
    supportCheck = require('./check_support.json'),
    doneCheck = require('./check_done.json'),
    CryptoJS = require("crypto-js");


function respond(message) {
    message = tryParseMessage(message);

    try { message = determineNextStep(message); } catch (e) { }

    return message;
}

function schedule(channel){
  //request.post('https://slack.com/api/chat.postMessage?token='+process.env.SLACK_AUTH_TOKEN+'&channel=DJGS6DCV6&pretty=1', {text:'scheduled'});
  var headers = {
      'Authorization': 'Bearer '+process.env.SLACK_AUTH_TOKEN,
      'Content-Type': 'application/JSON'
    };
  
  var body = { channel:channel, text:dayCheck.check.text, attachments: JSON.stringify(dayCheck.check.attachments)};
  request.post({ url: 'https://slack.com/api/chat.postMessage', form: body, headers: headers });
  
}

function determineNextStep(message) {

    if (!message || !message.payload) return message;

    message.payload = JSON.parse(message.payload);
    saveChoice(message);
    saveUser(message);
    request.post(message.payload.response_url, determineResponse(message.payload.callback_id));

    return message;
}

function determineResponse(callback_id) {
    if (callback_id == dayCheck.check.attachments[0].callback_id) return projectCheck;
    if (callback_id == projectCheck.json.attachments[0].callback_id) return supportCheck;

    return doneCheck;
}

function saveChoice(message) {
    datastore.set(createUniqueChoiceKey(message), createChoicePayload(message));
}

function createChoicePayload(message) {
    return {
        userId: encrypt(message.payload.user.id), //message.payload.user.id;//encrypt this further for security/privacy sake?
        question: message.payload.callback_id,
        choice: message.payload.actions[0].value
    }
}

function createUniqueChoiceKey(message) {
    return getDateString() + '_' + encrypt(message.payload.user.id) + '_' + message.payload.callback_id;
}

function encrypt(){
var key = CryptoJS.enc.Base64.parse(process.env.AES_KEY);
var iv  = CryptoJS.enc.Base64.parse(process.env.AES_IV);
return CryptoJS.AES.encrypt(process.env.AES_PASSPHRASE, key, {iv: iv}).toString();
}

function getDateString() {
    var today = new Date();
    return today.getFullYear().toString() + (today.getMonth() + 1).toString() + today.getDate().toString();
}

function saveUser(message) {
    datastore.set(message.payload.user.id, message.payload.user.name);
}

function tryParseMessage(message) {
    if (typeof message === 'string') {
        try {
            message = JSON.parse(message);
        } // JSON string
        catch (e) {
            message = qs.parse(message);
        } // QueryString
    }
    return message;
}

module.exports = {
    respond: respond,
  schedule: schedule
};