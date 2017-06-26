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

/**
* @module {events} can-dom-mutate/events/attributes attributes
* @parent can-dom-mutate/events
*
* Adds a listenable "attributes" event to DOM nodes, which fires when
* the node's attributes change.
*
* ```js
* var events = require('can-dom-events');
* var attributesEvent = require('can-dom-mutate/events/attributes');
* var el = document.createElement("div");
*
* domEvents.addEvent(attributesEvent);
*
* function attributesHandler() {
* 	console.log("attributes event fired");
* }
*
* domEvents.addEventListener(el, "attributes", attributesHandler);
*
* domEvents.removeEventListener(el, "attributes", attributesHandler);
* ```
*/
module.exports = makeMutationEvent('attributes', onNodeAttributeChange, dispatch);
