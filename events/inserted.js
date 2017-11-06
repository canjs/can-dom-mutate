'use strict';

var makeMutationEvent = require('./-make-mutation-event');
var onNodeInsertion = require('../can-dom-mutate').onNodeInsertion;

/**
* @module {events} can-dom-mutate/events/inserted inserted
* @parent can-dom-mutate/events
*
* This event fires when the bound element is added to the DOM.
*
* ```js
* var domEvents = require('can-dom-events');
* var insertedEvent = require('can-dom-mutate/events/inserted');
* var mutate = require('can-dom-mutate/node');
* var foo = document.createElement('div');
*
* domEvents.addEvent(insertedEvent);
*
* domEvents.addEventListener(foo, 'inserted', function log () {
*   console.log('inserted event fired');
* });
*
* mutate.appendChild.call(document.body, foo); // inserted event fired
*/
module.exports = makeMutationEvent('inserted', onNodeInsertion);
