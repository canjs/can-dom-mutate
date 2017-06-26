'use strict';

var makeMutationEvent = require('./make-mutation-event');
var onNodeRemoval = require('../can-dom-mutate').onNodeRemoval;

function dispatch(dispatchEvent, target, eventType) {
	dispatchEvent(target, eventType, false);
}

/**
* @module {events} can-dom-mutate/events/removed removed
* @parent can-dom-mutate/events
*
* This event fires when the bound element is removed from the document.
* This event is only dispatched once and then unbound.
*
* ```js
* var domEvents = require('can-dom-events');
* var removeEvent = require('can-dom-mutate/events/removed');
* var mutate = require('can-dom-mutate/node');
*
* domEvents.addEvent(removeEvent);
*
* var foo = document.createElement("div");
* mutate.appendChild.call(document.body, foo);
*
* function log () {  }
* domEvents.addEventListener(foo, "removed", function log () {
*   console.log("removed event fired");
* });
*
* mutate.removeChild.call(document.body, foo); // remove event fired
*/
module.exports = makeMutationEvent('removed', onNodeRemoval, dispatch, true);
