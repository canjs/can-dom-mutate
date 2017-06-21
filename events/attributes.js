'use strict';
var makeMutationEvent = require('./make-mutation-event');
var onNodeAttributeChange = require('../can-dom-mutate').onNodeAttributeChange;
function dispatch(dispatchEvent, target, eventType, changeset) {
  var eventData = {
    type: eventType,
    attributeName: changeset.attributeName,
    oldValue: changeset.oldValue
  };
  dispatchEvent(target, eventData, false);
}
module.exports = makeMutationEvent('attributes', onNodeAttributeChange, dispatch);