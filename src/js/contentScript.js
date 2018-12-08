import Mammoth from 'mammoth-data-library';
import $ from "jquery";
import _ from "lodash";
const BASE_URL = 'https://eureka.mammoth.io';

let inited = false;
let mammoth = new Mammoth(BASE_URL + '/api/v1');
let _mammothRegistry;
let _tableRegistry = {};
let knownTables = [];
let trackingInfo = {};
let tableLength = {};
let trackingURL = 'https://qa.mammoth.io/api/v1/webhook/data/LW5QcnJDzfS0';

_captureBrowserDetails();
init();

chrome.runtime.onMessage.addListener(
    function(message, sender, sendResponse) {
        switch(message.type) {
            case "status":
                sendResponse(null);
                init();
            break;
        }
    }
);

function init(){
  chrome.storage.local.get('_mammothRegistry', function (items) {
      _mammothRegistry = items._mammothRegistry;
      if(_mammothRegistry && _mammothRegistry.token && _mammothRegistry.account && _mammothRegistry.account.id){
        mammoth.setTokenAccountId(
          _mammothRegistry.token, _mammothRegistry.account.id).then(_setTokenAccountCb);
      }
  });
}

function _setTokenAccountCb(){
  // console.log(_mammothRegistry);
  _findAllHtmlTables();
  setInterval(_findAllHtmlTables, 5000);
}

function _findAllHtmlTables(){
  let tables = $('table');
  $.each(tables, function(i, table){
    handleTable(table)
  });
  if(!inited){
      _logData("init", {"tables": tables.length});
  }
  inited = true;
}


function getNewTableOverlay(id){
  return '<div id="'+ id + '"><span>Feed Mammoth</span></div>'
}

function handleTable(table){
  if(knownTables.indexOf(table) != -1){
    return;
  }
  let tblEle = $(table);
  if(tblEle){
    let headerCols = $(tblEle).find('th');
    let rowElements = $(tblEle).find('tr');

    if(!headerCols.length){
      return;
    }
    if(!rowElements.length){
      return;
    }
    let id = ('mt_' + Math.random()).replace('.', '_');
    _tableRegistry[id] = table;
    knownTables.push(table);
    let p = $(tblEle).offset();
    let w = $(tblEle).width();
    let newOverLay = getNewTableOverlay(id);
    let oEle = $('body').append(newOverLay);
    let oSelector = '#' + id;
    $(oSelector).css({
      top: p.top,
      left: p.left + w + 10,
      boder: '1px solid yellow',
      width: 140,
      height: 30,
      background: '#56c28c',
      position: 'absolute',
      cursor: 'pointer',
      'color': '#000',
      'background-color': '#56c28c',
      'border-color': '#56c28c',
      'text-align': 'center',
      'vertical-align': 'center',
      'borer-radius': '5px',
      'padding': '5px',
      'z-index': 100
    });
    $(oSelector).on("click", getPushHandler(id));
  }
}


function getPushHandler(id){
  return function(){
    let table = _tableRegistry[id];
    $("#" + id).remove();
    pushTable(table);
  }
}

function pushTable(element){
  mammoth.resources.startPolling();
  let data = [];
  let headers = [];
  let internalNames = {};
  let headerRows = $($($(element)[0]).find('thead')).find('tr');
  let lastHeader = headerRows[headerRows.length - 1];
  let headerCols = $(lastHeader).find('th');

  $.each(headerCols, function(i, e){
    let headerText = $(e).text().trim();
    if(headerText.length == 0){
      headerText = 'Header';
    }
    let header = headerText;
    let index = 2;
    while(headers.indexOf(header) != -1){
      header = (headerText + index);
      index++;
    }
    headers.push(header);
    internalNames[header] = 'header' + i;
  });
  let types = {};
  let rowElements = $($($(element)[0])).find('tbody tr');
  $.each(rowElements, function(i, re){
    let row = {};
    let cellElements = $(re).find('td');
    if(cellElements.length == 0){
      return true;
    }
    $.each(cellElements, function(j, ce){
      let h = headers[j];
      let iname = internalNames[h];

      let cd = _getCellData(ce);
      cd = cd.trim();
      if(cd == ""){
        cd = null;
      }
      if(cd == '""'){
        cd  = null;
      }
      if(cd !== null){
        if(isNaN(cd)){
          types[iname] = 'TEXT';
        }
        else{
          types[iname] = types[iname] || 'NUMERIC';
        }
      }
      if(types[iname] == 'NUMERIC' && cd !== null){
        row[iname] = parseFloat(cd);
      }
      else{
          row[iname] = cd;
      }
    });
    if(Object.keys(row).length){
        data.push(row);
    }
  });
  let metadata = [];
  $.each(headers, function(i, h){
    let iname = internalNames[h];
    metadata.push({
      display_name: h,
      internal_name: iname,
      type: types[iname]||'TEXT'
    });
  });
  let tableDetails = {
    "headers": headers,
    "types": _.values(types),
    "rows ": data.length,
    "columns ": metadata.length,
    'url': window.location.href,
    "selector": $(element).selector
  };
  _logData("click", tableDetails);
  _addDs();

  function _addDs(){
    let pageTitle = document.title;
    let dsName = pageTitle.replace(/[^\w\s]/gi, '');
    if(parseInt(dsName[0]) == dsName[0]){
      dsName = "Dataset " + dsName;
    }
    dsName = dsName.substring(0, 50);
    mammoth.createDatasetFromJson(dsName, metadata, data).then(_addDsCb);
  }

  function _addDsCb(dsId){
    setTimeout(function(){
      mammoth.getDsById(dsId).then(_getDsCb, _failureCb);
    }, 5000);
  }
  function _failureCb(){
    _logData("failure", tableDetails);
    mammoth.resources.stopPolling();
  }

  function _getDsCb(ds){
    ds.listWorkspaces().then(_listWsCb, _failureCb);
  }

  function _listWsCb(list){
    if(list.length){
      _logData("success", tableDetails);
      window.open(BASE_URL + '#workspaces/' + list[0].id);
      mammoth.resources.stopPolling();
    }
    else{
      _failureCb();
    }
  }
}

function _getCellData(element){
  return $(element).text();
}



function _captureBrowserDetails(){
  var nVer = navigator.appVersion;
  var nAgt = navigator.userAgent;
  var browserName  = navigator.appName;
  var fullVersion  = ''+parseFloat(navigator.appVersion);
  var majorVersion = parseInt(navigator.appVersion,10);
  var nameOffset,verOffset,ix;

  // In Opera, the true version is after "Opera" or after "Version"
  if ((verOffset=nAgt.indexOf("Opera"))!=-1) {
   browserName = "Opera";
   fullVersion = nAgt.substring(verOffset+6);
   if ((verOffset=nAgt.indexOf("Version"))!=-1)
     fullVersion = nAgt.substring(verOffset+8);
  }
  // In MSIE, the true version is after "MSIE" in userAgent
  else if ((verOffset=nAgt.indexOf("MSIE"))!=-1) {
   browserName = "Microsoft Internet Explorer";
   fullVersion = nAgt.substring(verOffset+5);
  }
  // In Chrome, the true version is after "Chrome"
  else if ((verOffset=nAgt.indexOf("Chrome"))!=-1) {
   browserName = "Chrome";
   fullVersion = nAgt.substring(verOffset+7);
  }
  // In Safari, the true version is after "Safari" or after "Version"
  else if ((verOffset=nAgt.indexOf("Safari"))!=-1) {
   browserName = "Safari";
   fullVersion = nAgt.substring(verOffset+7);
   if ((verOffset=nAgt.indexOf("Version"))!=-1)
     fullVersion = nAgt.substring(verOffset+8);
  }
  // In Firefox, the true version is after "Firefox"
  else if ((verOffset=nAgt.indexOf("Firefox"))!=-1) {
   browserName = "Firefox";
   fullVersion = nAgt.substring(verOffset+8);
  }
  // In most other browsers, "name/version" is at the end of userAgent
  else if ( (nameOffset=nAgt.lastIndexOf(' ')+1) <
            (verOffset=nAgt.lastIndexOf('/')) )
  {
   browserName = nAgt.substring(nameOffset,verOffset);
   fullVersion = nAgt.substring(verOffset+1);
   if (browserName.toLowerCase()==browserName.toUpperCase()) {
    browserName = navigator.appName;
   }
  }
  // trim the fullVersion string at semicolon/space if present
  if ((ix=fullVersion.indexOf(";"))!=-1)
     fullVersion=fullVersion.substring(0,ix);
  if ((ix=fullVersion.indexOf(" "))!=-1)
     fullVersion=fullVersion.substring(0,ix);

  majorVersion = parseInt(''+fullVersion,10);
  if (isNaN(majorVersion)) {
   fullVersion  = ''+parseFloat(navigator.appVersion);
   majorVersion = parseInt(navigator.appVersion,10);
  }


  var OSName="Unknown OS";
  if (navigator.appVersion.indexOf("Win")!=-1) OSName="Windows";
  if (navigator.appVersion.indexOf("Mac")!=-1) OSName="MacOS";
  if (navigator.appVersion.indexOf("X11")!=-1) OSName="UNIX";
  if (navigator.appVersion.indexOf("Linux")!=-1) OSName="Linux";


  trackingInfo = {
    'Browser name':browserName,
    'Full version':fullVersion,
    'Major version':majorVersion,
    'navigator appName':navigator.appName,
    'navigator userAgent':navigator.userAgent,
    'OSName': OSName,
    'initial_url': window.location.href
  }
}



function _logData(event, properties){
  let data = {
    event: event,
    properties: properties,
    tracking: trackingInfo
  }
  $.ajax({
    url: trackingURL,
    type: 'POST',
    dataType: "json",
    contentType: "application/json; charset=utf-8",
    data: JSON.stringify(data)
  });
  console.log(data);
}
