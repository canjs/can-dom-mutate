@module {{}} can-dom-mutate
@parent can-dom-utilities
@collection can-infrastructure
@package ./package.json

@description Dispatch and listen for DOM mutations.
@group can-dom-mutate.static 0 methods
@group can-dom-mutate/modules 1 modules
@signature `domMutate`

`can-dom-mutate` exports an object that lets you listen to changes
in the DOM using the [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
API.

```js
import {domMutate} from "can";

domMutate
// -> {
//     onAttributeChange( documentElement, callback ),
//     onInsertion( documentElement, callback ),
//     onRemoval( documentElement, callback ),
//     onNodeAttributeChange( node, callback ),
//     onNodeInsertion( node, callback ),
//     onNodeRemoval( node, callback )
//   }

// listen to every attribute change within the document:
domMutate.onAttributeChange(document.documentElement, function(mutationRecord){
  mutationRecord.target        //-> <input>
  mutationRecord.attributeName //-> "name"
  mutationRecord.oldValue      //-> "Ramiya"
})
```

If you want to support browsers that do not support the `MutationObserver` api, use
[can-dom-mutate/node] to update the DOM. Every module within CanJS should do this:

```js
var mutate = require('can-dom-mutate/node');
var el = document.createElement('div');

mutate.appendChild.call(document.body, el);
```

@body

## Use


```js
import {domMutate, domMutateNode} from "can";

var element = document.createElement("div");

var teardown = domMutate.onNodeInsertion(element, ()=>{
	console.log("element inserted!");
});

setTimeout(function(){
	domMutateNode.appendChild.call(document.body, element);
},1000);
```
@codepen
