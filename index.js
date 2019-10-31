//
// This implements most of the bot code. It starts off by looking for the `bot_token` value that will
// have been stored if you successfully OAuthed with your Bot using the 'Add to Slack' button. Assuming
// it exists, it implements an instance of `slack`, and then listens out for incoming HTTP requests.
// It also implements code that watches for slash commands, sets up event handling for when events
// like `pin_added`, `star_added` or `reaction_added` are received. As well as using the MongoDB
// to record when actions like adding a star have been completed.
//

"use strict";

const ts = require('./tinyspeck.js'),
      dayCheck = require('./check_day.json'), 
      users = {},
      datastore = require("./datastore.js").async;

var connected=false;

  getConnected() // Check we have a database connection
    .then(function(){
      datastore.get("bot_token") // Grab the bot token before proceeding
      .then(function(value){
        var slack;
        
        if(!value){
          console.log("There's no bot token stored - you need to auth this bot with Slack for it to be fully functional"); 
          // we need to be able to respond to verify requests from Slack before we
          // have a bot token set, so not setting one
          slack = ts.instance({});
        } else {
          console.log("Using bot token"); 
          // we have the bot_token set, so we're good to go
          slack = ts.instance({ token:value });
        }
        
        function getStatusMessage(user) {
          return Object.assign({ channel: user }, {json:{text:"status"}}, users[user]);
        }
        
        function modifySteps(user, type, item, counter, message){
          counter++;
          let step = message.attachments[counter];
    
          if(counter==message.attachments.length){ // got all values back, can move on
            console.log("Got all data back, sending response");
            // save the message and update the timestamp
            slack.send(message).then(res => { // on success
              console.log("Response sent to event");
              let ts = res.data.ts;
              let channel = res.data.channel;
              users[user] = Object.assign({}, message, { ts: ts, channel: channel });
            }, reason => { // on failure
              console.log("An error occurred when responding to event: " + reason);              
            }); 
          } else if(counter<message.attachments.length){
            let storedStep;
            let valueRef = user+step.event; // sets a user-specific reference used to refer to data in the dynamodb
                
            datastore.get(valueRef)
            .then(function(value) {
              storedStep = value;
                  
              if(storedStep){
               step.title += " :white_check_mark:";
               step.color = "#2ab27b";
               step.completed = true;
              } else {
               if (step.event === type) {
                  step.title += " :white_check_mark:";
                  step.color = "#2ab27b";
                  step.completed = true;
                  datastore.set(valueRef, true).then(function() { // store that the step has been completed in the dynamodb
                    console.log("Saved true for: " + valueRef);
                  });
               }
              }
              // recursively call self until all responses back
              modifySteps(user, type, item, counter, message);
            }); 
          }
        }
        slack.on('/check', payload => {
          console.log("Received slash command from user " + payload.user_id);
          let user_id = payload.user_id;
          let response_url = payload.response_url;
          let message = getMessage(user_id, dayCheck.check);
          
          // send current status privately
          slack.send(response_url, message).then(res => { // on success
            console.log("Response sent to slash command");
          }, reason => { // on failure
            console.log("An error occurred when responding to slash command: " + reason);
          }); 
        });
        
        function getMessage(user, msg) {
          return Object.assign({ channel: user }, msg, users[user]);
        }
        
        // event handler
        slack.on('star_added', 'pin_added', 'reaction_added', payload => {  
          console.log("Received: " + payload.event.type + " from user " + payload.event.user);
          let type = payload.event.type;
          let user = payload.event.user;
          let item = payload.event.item;
          let counter=-1;
          
          // get the user's current message
          let message = getStatusMessage(user);
        
          if(isJSON(message.attachments)){
            message.attachments = JSON.parse(message.attachments);
          }    
        
          // modify completed step
          modifySteps(user, type, item, counter, message);
        });
        
        // incoming http requests
        slack.listen(process.env.PORT);
    });
  });

function getConnected() {
  return new Promise(function (resolving) {
    if(!connected){
      connected = datastore.connect().then(function(){
        resolving();
      });
    } else {
      resolving();
    }
  });
}

function isJSON(data) {
  var ret = true;
  try {
    JSON.parse(data);
  }catch(e) {
    ret = false;
  }
  return ret;
}