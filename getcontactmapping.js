var $ = require('nodobjc');
var util = require('util');

// Load the AddressBook framework.
$.framework('AddressBook');

function formatPhoneNumber(s) {
  var s2 = (""+s).replace(/(\+1|\D)/g, '');
  if(s2.length == 7) {
    s2 = "925" + s2
  }
  var m = s2.match(/^(\d{3})(\d{3})(\d{4})$/);
  return (!m) ? null : "+1" + m[1] + m[2] + m[3];
}


module.exports = function() {
  // Get an instance of the address book for the current user.
  var addressBook = $.ABAddressBook('addressBook');

  // Retrieve all contacts.
  var people = addressBook('people');

  var mapping = {}

  // Run through the list of contacts and print their first/last name.
  var count = people('count');
  for (var i = 0; i < count; i++) {
    var person    = people('objectAtIndex', i);
    var firstName = person('valueForProperty', $.kABFirstNameProperty) + "";
    var lastName  = person('valueForProperty', $.kABLastNameProperty) + "";
    var number = person('valueForProperty', $.kABPhoneProperty);
    if(number) {
      var numberCount = number('count');
      var numbers = [];
      for(var numIdx = 0; numIdx < numberCount; numIdx += 1) {
        currentNum = number('valueAtIndex', numIdx)
        currentNumNormalized = formatPhoneNumber(currentNum)
        mapping[currentNumNormalized] = firstName.toLowerCase()
      }
    }
  }
  return mapping
}
