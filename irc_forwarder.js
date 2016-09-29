var mapping = require("./contacts.json")
var irc = require('irc')
var imessagemodule = require("iMessageModule");
var sqlite3 = require('sqlite3').verbose();
var contactMapping = require('./getcontactmapping')();
var settings = require('./settings.json');
var _ = require('underscore');
var fs = require('fs');

var contactMap = mapping;

for(var number in contactMapping) {
  contactMap[number] = contactMapping[number];
}

var file = process.env.HOME + '/Library/Messages/chat.db';
var db = new sqlite3.Database(file);

console.log("Initializing IRC Client...")

var getKeys = function(obj){
   var keys = [];
   for(var key in obj){
      keys.push(key);
   }
   return keys;
}

var getValues = function(obj){
   var values = [];
   for(var key in obj){
      values.push(obj[key]);
   }
   return values;
}

function swap(json){
  var ret = {};
  for(var key in json){
    ret[json[key]] = key;
  }
  return ret;
}

console.log(contactMap)

channels = ["#imessage"]
channels = channels.concat(getValues(contactMap).map((val) => "#" + val))
channels = _.uniq(channels)
fs.writeFileSync("contacts.json", JSON.stringify(contactMap))


topics = {}

var LAST_SEEN_ID = 0;

var client = new irc.Client(settings.serverIP, 'iMessageBot', {
  channels: channels,
  port: settings.port
})

client.addListener('error', function(message) {
  console.log('error: ', message);
})

setTimeout(function() {
  client.say("#imessage", "iMessage Bot Active!")
  for(var idx in channels) {
    console.log(channels[idx])
    client.say("#imessage", "Joining " + channels[idx] + "...")
  }
}, 1000)


//--------------------RECEIVING---------------------//
function checkMessageText(messageId) {
	var SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read, chat.chat_identifier, chat.display_name FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND message.ROWID = " + messageId + " ORDER BY message.date DESC LIMIT 500";

	db.serialize(function() {
		var arr = [];
		db.all(SQL, function(err, rows) {
			if (err) throw err;
			// should only be one result since we are selecting by id but I am looping anyways
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				if (row.is_from_me || !row || !row.text) {
					return;
				}

				var chatter;
				var isGroupChat = false;
        var gcName = null;
        var groupchatter = null;
				if (row.chat_identifier === null) {
					chatter = row.id;
				} else if (arr.indexOf(row.chat_identifier) < 0 && arr.indexOf(row.display_name+'-'+row.chat_identifier) < 0) {
					if (row.chat_identifier.indexOf('chat') > -1) {
						if (row.display_name && row.display_name !== "" && typeof(row.display_name) !== "undefined") {
							gcName = row.display_name;
              chatter = row.chat_identifier;
              groupchatter = row.id;
							isGroupChat = true;
						}
					} else {
						if (row.chat_identifier && row.chat_identifier !== "" && typeof(row.chat_identifier) !== "undefined") {
							gcName = row.chat_identifier;
              chatter = row.chat_identifier;
              groupchatter = row.id;
							isGroupChat = true;
						}
					}
				}

				var rowText = row.text;
				// rowText = rowText.toLowerCase();
				if (rowText.split(' ').length < 2 && rowText.indexOf('.') === 0) {
					console.log('dropping: ' + rowText);
					return;
				}

        var mappedChatter = contactMap[chatter]
        console.log(rowText, mappedChatter, isGroupChat, gcName)

        if(mappedChatter === undefined) {
          client.say("#imessage", "Unmapped chatter: " + chatter)
        } else {
          if(isGroupChat && topics[chatter] != gcName) {
            topics[chatter] = gcName
            client.send('TOPIC', '#' + chatter, "Group Chat: " + gcName)
          }
          text = ""
          if(isGroupChat) {
            var nameOfSender = contactMap[groupchatter] || groupchatter
            text = nameOfSender + ": "
          }
          text += rowText
          client.say("#" + mappedChatter, text)
        }
			}
		});
	});
}

db.serialize(function() {
	db.all("SELECT MAX(ROWID) AS max FROM message", function(err, rows) {
		if (rows) {
			var max = rows[0].max;
			if (max > LAST_SEEN_ID) {
				LAST_SEEN_ID = max;
				return;
			}
		}
	}.bind(this));
}.bind(this));

setInterval(function() {
	db.serialize(function() {
		db.all("SELECT MAX(ROWID) AS max FROM message", function(err, rows) {
			if (rows) {
				var max = rows[0].max;
				if (max >= LAST_SEEN_ID) {
					for (LAST_SEEN_ID; LAST_SEEN_ID <= max; LAST_SEEN_ID++) {
						checkMessageText(LAST_SEEN_ID);
					}
				}
			}
		}.bind(this));
	}.bind(this));
}, 300);

//-----------------SENDING------------------//
client.addListener('message', function (f, to, message) {
  if(f !== "jmeyer2k") {
    return
  }
  if(to === "#imessage") {
    if(message.startsWith("!addcontact")) {
      args = message.slice(12).split(" ")
      if(args.length !== 2) {
        client.say("#imessage", "Usage: !addcontact <number> <name>")
      }
      contactMap[args[0]] = args[1]
      fs.writeFileSync("contacts.json", JSON.stringify(contactMap))
    }
    if(message.startsWith("!synccontacts")) {
      var contactMapping = require('./getcontactmapping')();
      var mapping = require("./contacts.json")
      contactMap = mapping
      for(var number in contactMapping) {
        contactMap[number] = contactMapping[number];
      }
      channels = ["#imessage"]
      channels = channels.concat(getValues(contactMap).map((val) => "#" + val))
      channels = _.uniq(channels)
      fs.writeFileSync("contacts.json", JSON.stringify(contactMap))
    }
  }
  if(to.startsWith('#')) {
    var chan = to.slice(1)

    if(topics[chan] !== undefined) {
      imessagemodule.sendMessage(topics[chan], message, function(err) {});
    } else {
      if(swap(contactMap)[chan]) {
        imessagemodule.sendMessage(swap(contactMap)[chan], message, function(err) {});
      }
    }
  }
});
