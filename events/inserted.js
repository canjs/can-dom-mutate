'use strict';
var makeMutationEvent = require('./make-mutation-event');
var onNodeInsertion = require('../can-dom-mutate').onNodeInsertion;
function dispatch(dispatchEvent, target, eventType) {
  dispatchEvent(target, eventType, false);
}
module.exports = makeMutationEvent('inserted', onNodeInsertion, dispatch, true);