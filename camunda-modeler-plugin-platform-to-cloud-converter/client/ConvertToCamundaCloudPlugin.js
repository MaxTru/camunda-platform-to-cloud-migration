'use strict';
var $ = require('jquery');
const convertJuel = require("./JuelToFeelConverter");

import BpmnJS from "bpmn-js/lib/Modeler";

import camundaModdlePackage from "camunda-bpmn-moddle/resources/camunda";
import camundaModdleExtension from "camunda-bpmn-moddle/lib";

import zeebeModdlePackage from "zeebe-bpmn-moddle/resources/zeebe";
import zeebeModdleExtension from "zeebe-bpmn-moddle/lib";

import modelerModdlePackage from 'modeler-moddle/resources/modeler';

const bpmnJS = new BpmnJS({
  additionalModules: [camundaModdleExtension, zeebeModdleExtension],
  moddleExtensions: {
    camunda: camundaModdlePackage,
    zeebe: zeebeModdlePackage,
    modeler: modelerModdlePackage
  }
  });
const moddle = bpmnJS.get('moddle');

export default function ConvertToCamundaCloudPlugin(elementRegistry, editorActions, canvas, modeling, eventBus, commandStack, overlays) {
  var self = this;

  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._canvas = canvas;
  this._eventBus = eventBus;
  this._commandStack = commandStack;
  this._overlays = overlays;

  this.state = {
    open: false
  };

  editorActions.register({
    convertToCamundaCloud: function() {
      self.convertToCamundaCloud();
    }
  });

  commandStack.registerHandler('finish.model.convertion', function () { 
    // noop;
  });
}

function finishModelConvertion() {
  // NOOP at the moment, executing the command triggers a 'elements.changed' event 
  // that marks the model as dirty - which all I want to have at the moment

  // we could also save the model if we would want to:
  // this._eventBus.fire('saveTab');
}

ConvertToCamundaCloudPlugin.prototype.convertToCamundaCloud = function() {
  var self = this;

  convertDefinitions(self._canvas.getRootElement());

  var elements = self._elementRegistry._elements;
  Object.keys(elements).forEach(function(key) {
    var element = elements[key].element;
    var hints;

    console.log(element);
    ///////////////////////////////////////////////////////////////////////////
    if (element.type == "bpmn:ServiceTask") {
      hints = convertServiceTask(element);
    } else if (element.type == "bpmn:SendTask") {
      hints = convertServiceTask(element);
    } else if (element.type == "bpmn:CallActivity") {
      hints = convertCallActivity(element);
    } else if (element.type == "bpmn:UserTask") {
      hints = convertUserTask(element);
    } else if (element.type == "bpmn:ExclusiveGateway") {
      hints = convertXorGateway(element);
    } else if (element.type == "bpmn:SequenceFlow") {
      hints = convertSequenceFlow(element);
    }
  ///////////////////////////////////////////////////////////////////////////

    if (hints && hints.length > 0) {
      addOverlay(self._overlays, element, hints.join("<br>"));
    }
  });

  self._commandStack.execute('finish.model.convertion');  
};

function addOverlay(overlays, element, text) {
  var tooltipId = element.id + '_tooltip_info';
  overlays.add(element, 'migration-info-marker', {
    position: { top: 0, left: 0 },
    html: 
      '<div>' +
      '  <div style="background: #D2335C;">'+'Hints from migration'+'</div>' + 
      '  <div id="' + tooltipId + '" style="width:500px; background-color: #FFDE00;">'+text+'</div>' +
      '</div>'
  });
  addListener(element, tooltipId);
}
function addListener(element, tooltipId) {
  $('[data-element-id="' + element.id + '"]')
    .hover(
      function () { $('#' + tooltipId).show(); },
      function () { $('#' + tooltipId).hide(); }
    );
  $('#' + tooltipId).hide();
}

function addExtensionElement(element, extensionElement) {
  if (!element.businessObject.extensionElements) {
    var moddleExtensionElements = moddle.create('bpmn:ExtensionElements', {});          
    moddleExtensionElements.get('values').push(extensionElement);
    element.businessObject.extensionElements = moddleExtensionElements;
    return extensionElement;
  } else {
    for (const extensionElementInLoop of element.businessObject.extensionElements.get('values')) {
      if (extensionElementInLoop.$type == extensionElement.$type) { // already exists - return it
        return extensionElementInLoop;
      }
    }
    // doesn't exist yet - push it to the list:
    element.businessObject.extensionElements.get('values').push(extensionElement);
    return extensionElement;
  }
}

function createTaskDefinition(element, taskType) {
  var taskDef = addExtensionElement(element, moddle.create("zeebe:TaskDefinition"));
  taskDef.type = taskType;  
}

function addTaskHeader(element, key, value) {
  var header = moddle.create("zeebe:Header");
  header.key = key;
  header.value = value;

  var taskHeaders = addExtensionElement(element, moddle.create("zeebe:TaskHeaders", {}));
  taskHeaders.get('values').push(header);    
}

/**
 * 
 *  {  if ( type === 'bpmn:Process' ) {
    return name + 'Process';
  } else if ( type === 'bpmn:IntermediateCatchEvent' || type === 'bpmn:IntermediateThrowEvent' ) {
    return name + 'Event';
  } else if ( type === 'bpmn:UserTask' || type === 'bpmn:ServiceTask' || type === 'bpmn:ReceiveTask' || type === 'bpmn:SendTask' 
                || type === 'bpmn:ManualTask' || type === 'bpmn:BusinessRuleTask' || type === 'bpmn:ScriptTask' ) {
    return name + 'Task';
  } else if ( type === 'bpmn:ExclusiveGateway' || type === 'bpmn:ParallelGateway' || type === 'bpmn:ComplexGateway' 
                || type === 'bpmn:EventBasedGateway' ) {
    return name + 'Gateway';
  } else {
    return name + type.replace('bpmn:','');
  }} element 
 */

/**
 * CONVERTION METHODS FOR VARIOUS ELEMENT TYPES
 * ###############################################
 */

function convertDefinitions(rootElement) {
  var definitionsElement = rootElement.businessObject.$parent;
  definitionsElement.set('modeler:executionPlatform', 'Camunda Cloud')
  definitionsElement.set('modeler:executionPlatformVersion', '1.1.0')  
}

function convertServiceTask(element) {
  var hints = [];
  console.log("------------ Service Task -----------------");

  if (element.businessObject.class) { // ```camunda:class```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "class", element.businessObject.class);
  } else if (element.businessObject.delegateExpression) { // ```camunda:delegateExpression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "delegateExpression", element.businessObject.delegateExpression);
  } else if (element.businessObject.expression) { // ```camunda:expression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "expression", element.businessObject.expression);
  } else if (element.businessObject.topic) { // External Tasks
    createTaskDefinition(element, element.businessObject.topic);
  }
  // TODO: IO, Field Injection, Expressions
  if (!element.businessObject.asyncBefore || !element.businessObject.asyncAfter) {
    hints.push("Service tasks are all 'async' in Camunda Cloud")
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}

function convertUserTask(element) {
  var hints = [];
  console.log("------------ User Task -----------------");

  if (element.businessObject.class) { // ```camunda:class```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "class", element.businessObject.class);
  } else if (element.businessObject.delegateExpression) { // ```camunda:delegateExpression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "delegateExpression", element.businessObject.delegateExpression);
  } else if (element.businessObject.expression) { // ```camunda:expression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "expression", element.businessObject.expression);
  } else if (element.businessObject.topic) { // External Tasks
    createTaskDefinition(element, element.businessObject.topic);
  }
  // TODO: IO, Field Injection, Expressions
  if (!element.businessObject.asyncBefore || !element.businessObject.asyncAfter) {
    hints.push("Service tasks are all 'async' in Camunda Cloud")
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}

// TODO: Add hint to model
function convertCallActivity(element) {
  var hints = [];
  console.log("------------ Call Activity -----------------");

  if (element.businessObject.calledElement) {
    var calledElementDef = addExtensionElement(element, moddle.create("zeebe:CalledElement"));
    calledElementDef.processId = element.businessObject.calledElement;
    //TODO: calledElementDef.propagateAllChildVariables
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}


function convertXorGateway(element) {
  // nothing to do, convertion is done in sequence flows
}

function convertSequenceFlow(element) {
  // nothing to do, convertion is done in sequence flows
  if (element.businessObject && element.businessObject.conditionExpression && element.businessObject.conditionExpression.body) {
    var feelResult = convertJuel(element.businessObject.conditionExpression.body);
    element.businessObject.conditionExpression.body = feelResult.feelExpression;
    return feelResult.hints;
  }
}


ConvertToCamundaCloudPlugin.$inject = [ 'elementRegistry', 'editorActions', 'canvas', 'modeling', 'eventBus', 'commandStack', 'overlays']; // 'bpmnjs'