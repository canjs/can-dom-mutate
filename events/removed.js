'use strict';
var makeMutationEvent = require('./make-mutation-event');
var onNodeRemoval = require('../can-dom-mutate').onNodeRemoval;
function dispatch(dispatchEvent, target, eventType) {
  dispatchEvent(target, eventType, false);
}
module.exports = makeMutationEvent('removed', onNodeRemoval, dispatch, true);