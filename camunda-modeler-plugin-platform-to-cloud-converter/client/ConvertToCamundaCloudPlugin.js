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
    } else if (element.type == "bpmn:ScriptTask") {
      hints = convertScriptTask(element);
    } else if (element.type == "bpmn:ReceiveTask") {
      hints = convertReceiveTask(element);
    } else if (element.type == "bpmn:BusinessRuleTask") {
      hints = convertBusinessRuleTask(element);
    }


  ///////////////////////////////////////////////////////////////////////////

    if (hints && hints.length > 0) {
      addOverlay(self._overlays, element, hints.join("<br />"));
    }
  });

  self._commandStack.execute('finish.model.convertion');
};

function addOverlay(overlays, element, text) {
  var tooltipId = element.id + '_tooltip_info';
  overlays.add(element, 'migration-info-marker', {
    position: { bottom: 0, right: 0 },
    html:
      `<div class="migration-hint"><b>Migration hints</b>
          <div class="migration-hint-text" id="${ tooltipId }">${ text }</div>
      </div>`
  });
  addListener(element, tooltipId);
}
function addListener(element, tooltipId) {
  $('[data-element-id="' + element.id + '"]')
    .hover(
      function () { $('#' + tooltipId).show(); },
      function () { $('#' + tooltipId).hide(); }
    );
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

function readExtensionElement(element, extensionElementType) {
  if (!element.businessObject.extensionElements) {
    return null;
  }
  for (const extensionElementInLoop of element.businessObject.extensionElements.get('values')) {
    if (extensionElementInLoop.$type == extensionElementType) {
      return extensionElementInLoop;
    }
  }
  return null;
}

function removeExtensionElement(element, extensionElementType) {
  if (!element.businessObject.extensionElements) {
    return false;
  }
  var extensionElementArray = element.businessObject.extensionElements.get('values');
  for (const extensionElementInLoop of extensionElementArray) {
    if (extensionElementInLoop.$type == extensionElementType) {
      const index = extensionElementArray.indexOf(extensionElementInLoop)
      extensionElementArray.splice(index, 1);
      return true;
    }
  }
  return false;
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

  function unsupportedElement(hints, elementType, extensionAttribute) {
    hints.push("Element " + extensionAttribute + " of " + elementType + " not supported");
  }
  function unsupportedAttribute(hints, elementType, extensionAttribute) {
    hints.push("Attribute " + extensionAttribute + " of " + elementType + " not supported (what does it do? See https://docs.camunda.org/manual/latest/reference/bpmn20/custom-extensions/extension-attributes/#"+extensionAttribute+")");
  }
  function unsupportedExtensionElement(hints, elementType, extensionElement) {
    hints.push("Element " + extensionElement + " of " + elementType + " not supported (what does it do? See https://docs.camunda.org/manual/latest/reference/bpmn20/custom-extensions/extension-elements/#"+extensionElement+")");
  }


/**
 * ###############################################
 * CONVERTION METHODS FOR VARIOUS ELEMENT TYPES
 * ###############################################
 */

function convertDefinitions(rootElement) {
  var definitionsElement = rootElement.businessObject.$parent;
  definitionsElement.set('modeler:executionPlatform', 'Camunda Cloud')
  definitionsElement.set('modeler:executionPlatformVersion', '1.1.0')
}

/**
 * ##################
 * # Service Task
 * # https://docs.camunda.org/manual/7.15/reference/bpmn20/tasks/service-task/
 * ##################
 */
function convertServiceTask(element) {
  var hints = [];
  console.log("------------ Service Task -----------------");

  if (element.businessObject.class) { // ```camunda:class```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "class", element.businessObject.class);
    element.businessObject.class = null;
  } else if (element.businessObject.delegateExpression) { // ```camunda:delegateExpression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "delegateExpression", element.businessObject.delegateExpression);
    element.businessObject.delegateExpression = null;
  } else if (element.businessObject.expression) { // ```camunda:expression```
    createTaskDefinition(element, "camunda-platform-to-cloud-migration");
    addTaskHeader(element, "expression", element.businessObject.expression);
    addTaskHeader(element, "resultVariable", element.businessObject.resultVariable);
    element.businessObject.expression = null;
    element.businessObject.resultVariable = null;
  } else if (element.businessObject.topic) { // External Tasks
    createTaskDefinition(element, element.businessObject.topic);
    element.businessObject.topic = null;
  }

  if (!element.businessObject.asyncBefore || !element.businessObject.asyncAfter) {hints.push("Service tasks are all 'async' in Camunda Cloud");}
  // if (element.businessObject.exclusive) Exclusive is ignored - as all jobs are automatically exclusive in Camunda Cloud
  if (element.businessObject.jobPriority) {unsupportedAttribute(hints, "Service Task", "jobPriority");}
  if (element.businessObject.taskPriority) {unsupportedAttribute(hints, "Service Task", "taskPriority");}
  if (element.businessObject.type) {unsupportedAttribute(hints, "Service Task", "type");}

  if (readExtensionElement(element, "failedJobRetryTimeCycle")) {unsupportedExtensionElement(hints, "Service Task", "failedJobRetryTimeCycle");}
  if (readExtensionElement(element, "connector")) {unsupportedExtensionElement(hints, "Service Task", "connector");}
  //if (errorEventDefinition = readExtensionElement(element, "errorEventDefinition")) {
    // TODO handle errorEventDefinition
  //}
  //if (field = readExtensionElement(element, "field")) {
    // TODO handle field
  //}
  //if (inputOutput = readExtensionElement(element, "inputOutput")) {
    // TODO handle inputOutput
  //}
  if (readExtensionElement(element, "taskListener")) {
    unsupportedExtensionElement(hints, "Service Task", "taskListener");
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}

/**
 * ##################
 * # User Task
 * # https://docs.camunda.org/manual/7.15/reference/bpmn20/tasks/user-task/
 * ##################
 */
function convertUserTask(element) {
  var hints = [];
  console.log("------------ User Task -----------------");

  // Assignment
  if (element.businessObject.humanPerformer) {unsupportedElement(hints, "User Task", "humanPerformer");}
  if (element.businessObject.potentialOwner) {unsupportedElement(hints, "User Task", "potentialOwner");}
  if (element.businessObject.assignee) {unsupportedAttribute(hints, "User Task", "assignee");}
  if (element.businessObject.candidateUsers) {unsupportedAttribute(hints, "User Task", "candidateUsers");}
  if (element.businessObject.candidateGroups) {unsupportedAttribute(hints, "User Task", "candidateGroups");}

  // Forms TODO: Think about form migration
  if (element.businessObject.formKey) {unsupportedAttribute(hints, "User Task", "formKey");}
  if (element.businessObject.formHandlerClass) {unsupportedAttribute(hints, "User Task", "formHandlerClass");}
  if (readExtensionElement(element, "formData")) {unsupportedExtensionElement(hints, "Service Task", "formData");}
  if (readExtensionElement(element, "formProperty")) {unsupportedExtensionElement(hints, "Service Task", "formData");}

  if (element.businessObject.dueDate) {unsupportedAttribute(hints, "User Task", "dueDate");}
  if (element.businessObject.followUpDate) {unsupportedAttribute(hints, "User Task", "followUpDate");}
  if (element.businessObject.priority) {unsupportedAttribute(hints, "User Task", "priority");}
  // Ignore asyncBefore, asyncAfter, exclusive, jobPriority, failedJobRetryTimeCycle - as without listeners that does not make any difference anyway

  //if (inputOutput = readExtensionElement(element, "inputOutput")) {
    // TODO handle inputOutput
  //}
  if (readExtensionElement(element, "taskListener")) {
    unsupportedExtensionElement(hints, "Service Task", "taskListener");
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}


/**
 * ##################
 * # Call Activity
 * # https://docs.camunda.org/manual/7.15/reference/bpmn20/subprocesses/call-activity/
 * ##################
 */
function convertCallActivity(element) {
  var hints = [];
  console.log("------------ Call Activity -----------------");

  if (element.businessObject.calledElement) {
    var calledElementDef = addExtensionElement(element, moddle.create("zeebe:CalledElement"));

    var feelResult = convertJuel(element.businessObject.calledElement);
    calledElementDef.processId = feelResult.feelExpression;
    hints.push(feelResult.hints);
  }
  if (element.businessObject.calledElementBinding) {unsupportedAttribute(hints, "Call Activity", "calledElementBinding");}
  if (element.businessObject.calledElementVersionTag) {unsupportedAttribute(hints, "Call Activity", "calledElementVersionTag");}

  // Variables
  // https://docs.camunda.org/manual/7.15/reference/bpmn20/subprocesses/call-activity/#passing-variables
  // No attribute in Camunda Platform like "calledElementDef.propagateAllChildVariables"
  if (element.businessObject.variableMappingClass) {unsupportedAttribute(hints, "Call Activity", "variableMappingClass");}
  if (element.businessObject.variableMappingDelegateExpression) {unsupportedAttribute(hints, "Call Activity", "variableMappingDelegateExpression");}

  var inMapping = readExtensionElement(element, "camunda:In");
  if (inMapping) {
    // Ignore variables all - this is the default in CamundaCloud
    //inMapping.variables;

    var zeebeInput = moddle.create('zeebe:Input', {});
    const ioMapping = addExtensionElement(element, moddle.create("zeebe:IoMapping", {}));
    ioMapping.get('inputParameters').push(zeebeInput); // see also https://github.com/bpmn-io/bpmn-js-properties-panel/blob/1b9317ec41b2c04281a9dd83c43f5ed412feb860/src/provider/cloud-element-templates/properties/CustomProperties.js#L548

    zeebeInput.target = inMapping.target;
    if (inMapping.source) {
      zeebeInput.source = "= " + inMapping.source;
    } else if (inMapping.sourceExpression) {
      zeebeInput.source = convertJuel(inMapping.sourceExpression);
    }

    // Ignoring for now:
    // inMapping.local;

    // unsupportedExtensionElement(hints, "Call Activity", "in");
    //<camunda:in source="Xsource" target="Ytarget" />
    //<camunda:in variables="all" />
    // <camunda:out sourceExpression="#{Lalala}" target="target" local="true" />
    removeExtensionElement(element, "camunda:In");
  }

  var outMapping = readExtensionElement(element, "camunda:Out");
  if (outMapping) {

    var zeebeOutput = moddle.create('zeebe:Output', {});
    const ioMapping = addExtensionElement(element, moddle.create("zeebe:IoMapping", {}));
    ioMapping.get('outputParameters').push(zeebeOutput);

    zeebeOutput.target = outMapping.target;
    if (outMapping.source) {
      zeebeOutput.source = "= " + outMapping.source;
    } else if (outMapping.sourceExpression) {
      zeebeOutput.source = convertJuel(outMapping.sourceExpression);
    }

    // Ignoring for now
    //outMapping.businessObject.variables;
    //outMapping.businessObject.local;

    //unsupportedExtensionElement(hints, "Call Activity", "out");
    removeExtensionElement(element, "camunda:Out");
  }
  //if (inputOutput = readExtensionElement(element, "inputOutput")) {
    // TODO handle inputOutput
  //}

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

/**
 * ##################
 * # Script Task
 * # https://docs.camunda.org/manual/7.15/reference/bpmn20/tasks/script-task/
 * ##################
 */
function convertScriptTask(element) {
   // see  https://docs.camunda.io/docs/reference/bpmn-processes/script-tasks/script-tasks
   // This is considered not migratable at the moment, but
   // it could also use the copmmunity extension down the line: https://github.com/camunda-community-hub/zeebe-script-worker
   var hints = [];
   console.log("------------ Script Task -----------------");

   var scriptFormat = element.businessObject.scriptFormat;

  createTaskDefinition(element, "script");
  addTaskHeader(element, "language", element.businessObject.scriptFormat);
  addTaskHeader(element, "script", element.businessObject.script);

   hints.push("Scripts might not work as expected using the https://github.com/camunda-community-hub/zeebe-script-worker - please double check");

   console.log("------------ ---------- -----------------");
   return hints;

}

/**
 * ##################
 * # Business Rule Task
 * #
 * ##################
 */
 function convertBusinessRuleTask(element) {
  var hints = [];
  console.log("------------ Business Rule Task -----------------");

  if (element.businessObject.class || element.businessObject.delegateExpression || element.businessObject.expression || element.businessObject.topic) {
    // used like a service task
    convertServiceTask(element);
  } else {
    // used for specific DMN integration
    createTaskDefinition(element, "DMN");
    addTaskHeader(element, "decisionRef", element.businessObject.decisionRef);

    if (element.businessObject.decisionRefBinding) {unsupportedAttribute(hints, "Business Rule Task", "decisionRefBinding");}
    if (element.businessObject.decisionRefVersion) {unsupportedAttribute(hints, "Business Rule Task", "decisionRefVersion");}
    if (element.businessObject.decisionRefVersionTag) {unsupportedAttribute(hints, "Business Rule Task", "decisionRefVersionTag");}
    if (element.businessObject.mapDecisionResult) {unsupportedAttribute(hints, "Business Rule Task", "mapDecisionResult");}
    if (element.businessObject.resultVariable) {unsupportedAttribute(hints, "Business Rule Task", "resultVariable");}
    if (element.businessObject.decisionRefTenantId) {unsupportedAttribute(hints, "Business Rule Task", "decisionRefTenantId");}

    if (!element.businessObject.asyncBefore || !element.businessObject.asyncAfter) {hints.push("Tasks are all 'async' in Camunda Cloud");}
    // if (element.businessObject.exclusive) Exclusive is ignored - as all jobs are automatically exclusive in Camunda Cloud
    if (element.businessObject.jobPriority) {unsupportedAttribute(hints, "Business Rule Task", "jobPriority");}
    if (element.businessObject.taskPriority) {unsupportedAttribute(hints, "Business Rule Task", "taskPriority");}
    if (element.businessObject.type) {unsupportedAttribute(hints, "Business Rule Task", "type");}

    if (readExtensionElement(element, "failedJobRetryTimeCycle")) {unsupportedExtensionElement(hints, "Service Task", "failedJobRetryTimeCycle");}
    if (readExtensionElement(element, "connector")) {unsupportedExtensionElement(hints, "Service Task", "connector");}
  }

  console.log(element);
  console.log("------------ ---------- -----------------");
  return hints;
}

 /**
 * ##################
 * # Receive Task
 * #
 * ##################
 */
function convertReceiveTask(element) {
    var hints = [];
    console.log("------------ Receive Task -----------------");

    console.log(element);
    console.log("------------ ---------- -----------------");
    return hints;
}

/**
 * ##################
 * # Receive Event
 * #
 * ##################
 */

ConvertToCamundaCloudPlugin.$inject = [ 'elementRegistry', 'editorActions', 'canvas', 'modeling', 'eventBus', 'commandStack', 'overlays']; // 'bpmnjs'
