var roundware;
var streamPlayer, audioSource, pauseButton, playButton, killButton,
    skipButton, replayButton, tagIds, recordButton;
var assetMarkers = [];
var listenMap, speakMap;
var firstplay = false; // ultimately will be set to true initially to handle iOS playback properly
var use_listener_range = false;
var listener_circle_max, listener_circle_min;

function startListening(streamURL) {
  console.info("Loading " + streamURL);
  audioSource.prop("src",streamURL);
  streamPlayer.trigger("load");
  listenLatitude.prop("disabled",false);
  listenLongitude.prop("disabled",false);
  updateButton.prop("disabled",false);
}

function play(streamURL) {
  roundware.play(startListening).
    then(function handleListening() {
      console.info("Playing audio");
      streamPlayer.trigger("play");
      pauseButton.prop("disabled",false);
      playButton.prop("disabled",true);
      killButton.prop("disabled",false);
      replayButton.prop("disabled",false);
      skipButton.prop("disabled",false);
    }).
    catch(handleError);
}

function pause() {
  console.info("pausing");
  streamPlayer.trigger("pause");
  pauseButton.prop("disabled",true);
  playButton.prop("disabled",false);
  replayButton.prop("disabled",true);
  skipButton.prop("disabled",true);
  roundware.pause();
}

function kill() {
  console.info("killing");
  streamPlayer.trigger("pause");
  pauseButton.prop("disabled",true);
  playButton.prop("disabled",false);
  killButton.prop("disabled",true);
  replayButton.prop("disabled",true);
  skipButton.prop("disabled",true);
  roundware.kill();
}

function replay() {
  console.log("replaying");
  roundware.replay();
}

function skip() {
  console.log("skipping");
  roundware.skip();
}

function update(data={}) {
  console.info("updating stream");
  let updateData = {};
  let listenTagIds = $("#uiListenDisplay input:checked").map(function() {
    return this.value;
  }).get().join();

  updateData.latitude = listenLatitude.val();
  updateData.longitude = listenLongitude.val();
  updateData.tagIds = listenTagIds;
  // handle any additional data params
  Object.keys(data).forEach(function(key) {
    updateData[key] = data[key];
  });
  console.log(updateData);
  roundware.update(updateData);
}

function ready() {
  console.info(`Connected to Roundware Server. Ready to play.`);

  playButton.prop("disabled",false);
  playButton.click(play);
  pauseButton.click(pause);
  killButton.click(kill);
  replayButton.click(replay);
  skipButton.click(skip);
  updateButton.click(update);

  displaySpeakTags();
  setupSpeakMap();

  // setup range listening toggle listener
  $('#isrange input:checkbox').change(
    function() {
      if ($(this).is(':checked')) {
        add_listener_range();
      } else {
        remove_listener_range();
      }
    }
  );
}

function displayListenTags() {
  console.log(roundware._uiConfig.listen);
  let listenUi = roundware._uiConfig.listen;
  $.each(listenUi, function(index,element) {
    console.log(index + ": " + element.header_display_text);
    let str = "";
    str += `<h4>${element.header_display_text}</h4>`;
    str += "<form>";
    $.each(element.display_items, function(index,element) {
      let checked = "";
      if (element.default_state) {
        checked = "checked";
      }
      str += `<input type="checkbox" value=${element.tag_id} ${checked}>${element.tag_display_text}<br>`;
    });
    str += "</form>";
    $('#uiListenDisplay').append(str);
  });

  // setup tag change listeners
  $('#uiListenDisplay input:checkbox').change(
    function() {
      update();
      showHideMarkers();
    });
}

function displaySpeakTags() {
  let listenUi = roundware._uiConfig.speak;
  let groupNum =0;

  $.each(listenUi, function(index,element) {
    let str = "";
    str += `<div class="step-header"><div class="step-number">${index + 1}</div><div class="step-copy"><h3>${element.header_display_text}</h3></div></div>`;
    str += "<div id='step-tags'><ul class='filtering-options fit'>";
    $.each(element.display_items, function(index, element) {
      str += `<li><input type="radio" class="tag" value=${element.tag_id} name=${groupNum} id="tag-${element.tag_id}" data-text=${element.tag_display_text}>
      <label class="tag button fit" for="tag-${element.tag_id}">${element.tag_display_text}</label></li>`;
    });
    str += "</ul></div>";
    groupNum++;
    $('#uiSpeakDisplay').append(str);
  });

  // setup tag change listeners
  $('#uiSpeakDisplay input:radio').click(function(event) {
    $(this).toggleClass('tag-selected');
      let speakTagIds = $("#uiSpeakDisplay input:checked").map(function() {
        return this.value;
      }).get().join();
      console.log(`Speak tags updated: ${speakTagIds}`);
    });
}

function mapSpeakers(map) {
  let speakers = roundware._speakerData;

  $.each(speakers, function (i, item) {
    map.data.addGeoJson({
      "type": "Feature",
      "geometry": item.shape,
      "properties": {
        "speaker_id": item.id,
        "name": "outer"
      }
    });
    map.data.addGeoJson({
      "type": "Feature",
      "geometry": item.attenuation_border,
      "properties": {
        "speaker_id": item.id,
        "name": "inner"
      }
    });
    map.data.setStyle(function(feature) {
      if (feature.getProperty('name') == "outer") {
        return {
          fillColor: '#aaaaaa',
          fillOpacity: .5,
          strokeWeight: 1,
          strokeOpacity: .5
        };
      }
      else if (feature.getProperty('name') == "inner") {
        return {
          fillColor: '#555555',
          fillOpacity: 0,
          strokeWeight: 1,
          strokeOpacity: .2
        };
      }
    });
  });
}

function mapAssets(map) {
  let assets = roundware._assetData;

  $.each(assets, function (i, item) {
    var marker_img = new google.maps.MarkerImage('https://www.google.com/intl/en_us/mapfiles/ms/micons/yellow-dot.png');
    var point = new google.maps.LatLng(item.latitude, item.longitude);
    // var tag_ids = item.tag_ids.toString();
    // console.log('tag_ids = ' + tag_ids);

    var marker = new google.maps.Marker({
    position: point,
    map: map,
    icon: marker_img
    });
    marker.id = item.id;
    marker.rw_tags = [];
    if (item.tag_ids) {
    marker.rw_tags = item.tag_ids;
    }
    // display asset shape if exists
    if (item.shape) {
    console.log("map the asset's shape");
    marker.shape = new google.maps.Data();
    marker.shape.addGeoJson({
      "type": "Feature",
      "geometry": item.shape,
      "properties": {
        "asset_id": item.id,
        "name": "assetRange"
      }
    });
    marker.shape.setStyle(function(feature) {
      if (feature.getProperty('name') == "assetRange") {
        return {
          fillColor: '#6292CF',
          fillOpacity: .25,
          strokeWeight: 1,
          strokeOpacity: .8,
          strokeColor: '#6292CF'
        };
      }
    });
    }
    // if no asset shape, display default circle range
    else {
      var circle = {
        strokeColor: '#6292CF',
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: '#6292CF',
        fillOpacity: 0.25,
        map: map,
        center: new google.maps.LatLng(item.latitude, item.longitude),
        radius: roundware._project.recordingRadius
      };
      marker.circle = new google.maps.Circle(circle);
      }
      assetMarkers.push(marker);
    });
}

function showHideMarkers() {
  $.each(assetMarkers, function(i, item) {
    // if any item tags are not included in selected tags, hide marker, otherwise show it
    let selectedListenTagIds = $("#uiListenDisplay input:checked").map(function() {
      return Number(this.value);
    }).get();
	var is_visible = true;
	$.each(item.rw_tags, function(j, tag_id) {
      // if tag_id isn't selected, set to false and return
      if (!(selectedListenTagIds.includes(tag_id))) {
        is_visible = false;
	    return;
	  }
	});
	item.setVisible(is_visible);
    if (item.circle) {
      item.circle.setVisible(is_visible);
    }
    if (item.shape) {
      if (is_visible) {
        item.shape.setMap(listenMap);
      } else if (!is_visible) {
        item.shape.setMap(null);
      }
    }
  });
}

/**
 * Add editable circles centered on listener pin that define the listener_range
 * every time either circle is edited, a PATCH streams/ is sent with lat/lon and listener_range_min/max
 */
function add_listener_range() {
    use_listener_range = true;
    var mapCenter = new google.maps.LatLng(listenLatitude.val(),
                                           listenLongitude.val());
    listener_circle_max = new google.maps.Circle({
        strokeColor: '#000000',
        strokeOpacity: 0.4,
        strokeWeight: 1,
        fillColor: '#000000',
        fillOpacity: 0.08,
        map: listenMap,
        center: mapCenter,
        radius: roundware._project.recordingRadius * 100,
        editable: true,
        draggable: false,
        geodesic: true
    });
    listener_circle_min = new google.maps.Circle({
        strokeColor: '#000000',
        strokeOpacity: 0.4,
        strokeWeight: 1,
        fillColor: '#000000',
        fillOpacity: 0,
        map: listenMap,
        center: mapCenter,
        radius: roundware._project.recordingRadius * 50,
        editable: true,
        draggable: false,
        geodesic: true
    });
    listenMap.setCenter(mapCenter);

    google.maps.event.addListener(listener_circle_max, "radius_changed", function (event) {
        lr_max = Math.round(listener_circle_max.getRadius());
        lr_min = Math.round(listener_circle_min.getRadius());
        // ensure listener_range_max isn't smaller than listener_range_min
        if (lr_max < lr_min) {
            listener_circle_max.setRadius(lr_min);
            console.log("maximum range can't be smaller than minimum range!")
        }
        if (!firstplay) {
          var data = { "listener_range_max": lr_max,
                       "listener_range_min": lr_min }
          update(data);
        }
        console.log("max range = " + lr_max);
    });
    google.maps.event.addListener(listener_circle_min, "radius_changed", function (event) {
        lr_min = Math.round(listener_circle_min.getRadius());
        lr_max = Math.round(listener_circle_max.getRadius());
        // ensure listener_range_min isn't larger than listener_range_max
        if (lr_min > lr_max) {
            listener_circle_min.setRadius(lr_max);
            console.log("minimum range can't be bigger than maximum range!")
        }
        if (!firstplay) {
          var data = { "listener_range_max": lr_max,
                       "listener_range_min": lr_min }
          update(data);
        }
    });
}

function remove_listener_range() {
  use_listener_range = false;
  listener_circle_max.setMap(null);
  listener_circle_min.setMap(null);
}
// Generally we throw user-friendly messages and log a more technical message
function handleError(userErrMsg) {
  console.error("There was a Roundware Error: " + userErrMsg);
}

$(function startApp() {
  roundware = new Roundware(window,{
    serverUrl: roundwareServerUrl + '/api/2',
    projectId: roundwareProjectId,
    geoListenEnabled: true,
    // apply any speaker filters here
    speakerFilters: {"activeyn": true},
    // apply any asset filters here
    assetFilters: {"submitted": true,
                   "media_type": "audio"}
  });

  // Listen elements
  streamPlayer    = $("#streamplayer");
  audioSource     = $("#audiosource");
  pauseButton     = $("#pause");
  playButton      = $("#play");
  killButton      = $("#kill");
  replayButton    = $("#replay");
  skipButton      = $("#skip");
  listenLatitude  = $("#listenLatitude");
  listenLongitude = $("#listenLongitude");
  updateButton    = $("#update");

  // Speak elements
  // recordButton       = $("#record");
  // recordButton  = $("#recordButton");

  roundware.connect().
    then(ready).
    catch(handleError);

   initRecording(); //initializes the recorder

});

// Google Maps

function setupListenMap() {
  var initialLocation = {lat: roundware._project.location.latitude,
                         lng: roundware._project.location.longitude};
  listenMap = new google.maps.Map(document.getElementById('listenMap'), {
    zoom: 16,
    center: initialLocation
  });
  var listener = new google.maps.Marker({
    position: initialLocation,
    map: listenMap,
    draggable: true
  });

  // setup geopositioning
  if (!navigator.geolocation) {
    console.log("no geolocation available for listening");
  }
  else {
    console.log("geolocation available");

    // on initial geoposition
    navigator.geolocation.getCurrentPosition(function(position) {
      initialLocation = {lat: position.coords.latitude,
                         lng: position.coords.longitude};
      console.log(`initial browser determined position = ${initialLocation}`);
      console.log(initialLocation);
      var data = {};
      update(data);
    });

    // on geoposition update
    var watchID = navigator.geolocation.watchPosition(function(position) {
      var newPosition = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
      // // update listen map
      listenMap.setCenter({lat:position.coords.latitude, lng:position.coords.longitude});
      listener.setPosition(newPosition);
      document.getElementById("listenLatitude").value = listener.getPosition().lat();
      document.getElementById("listenLongitude").value = listener.getPosition().lng();
      var data = {};
      update(data);
    });
  }

  google.maps.event.addListener(listener, "dragend", function(event) {
    document.getElementById("listenLatitude").value = listener.getPosition().lat();
    document.getElementById("listenLongitude").value = listener.getPosition().lng();
    listenMap.setCenter(listener.getPosition());
    var data = {};
    if (use_listener_range === true) {
      listener_circle_max.setCenter(new google.maps.LatLng(listener.getPosition().lat(),
                                                           listener.getPosition().lng()));
      listener_circle_min.setCenter(new google.maps.LatLng(listener.getPosition().lat(),
                                                           listener.getPosition().lng()));
      data = { "listener_range_max": Math.round(listener_circle_max.getRadius()),
               "listener_range_min": Math.round(listener_circle_min.getRadius())}
    }
    update(data);
  });
  mapAssets(listenMap);
  mapSpeakers(listenMap);
  showHideMarkers();
}

function updateLatLng(marker) {
  localStorage.setItem("lullaby_lat", marker.getPosition().lat());
  localStorage.setItem("lullaby_lng", marker.getPosition().lng());

  console.log("Geolocation: " + marker.getPosition().lat() + " " + marker.getPosition().lng());
}

function setupSpeakMap() {
  // Default Boston location
  var initialLocation = {
    lat: roundware._project.location.latitude,
    lng: roundware._project.location.longitude
  }

  localStorage.setItem("lullaby_lat", initialLocation.lat);
  localStorage.setItem("lullaby_lng", initialLocation.lng);

  // Find user geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(position) {
      initialLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }

      speakMap.setCenter(initialLocation);
      marker.setPosition(initialLocation);
      updateLatLng(marker);
    })
  } else {
    console.log("No geolocation available");
  }

  // Set up map, marker, and location search input with autocomplete
  speakMap = new google.maps.Map(document.getElementById('speakMap'), {
    center: initialLocation,
    zoom: 16,
    mapTypeControl: false,
    streetViewControl: false,
    styles: [
      {
        "featureType": "administrative",
        "elementType": "all",
        "stylers": [
          {"hue": "#000000"},
          {"lightness": -100},
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
          {"visibility": "on"},
          {"saturation": "-52"},
          {"lightness": "-22"},
          {"gamma": "1.52"},
          {"hue": "#ff000c"}
        ]
      },
      {
        "featureType": "landscape",
        "elementType": "labels",
        "stylers": [
          {"hue": "#000000"},
          {"saturation": -100},
          {"lightness": -100},
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "poi",
        "elementType": "all",
        "stylers": [
          {"hue": "#000000"},
          {"saturation": -100},
          {"lightness": -100},
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "road",
        "elementType": "geometry",
        "stylers": [
          {"hue": "#bbbbbb"},
          {"saturation": -100},
          {"lightness": 26},
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "road",
        "elementType": "labels",
        "stylers": [
          {"hue": "#ffffff"},
          {"saturation": -100},
          {"lightness": 100},
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "road.highway",
        "elementType": "geometry",
        "stylers": [
          {"lightness": "-19"},
          {"saturation": "-35"}
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "geometry.fill",
        "stylers": [
          {"color": "#faf7f7"},
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "geometry.stroke",
        "stylers": [
          {"color": "#e75b5b"},
          {"weight": "1.19"},
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "road.arterial",
        "elementType": "labels.text",
        "stylers": [
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "road.local",
        "elementType": "all",
        "stylers": [
          {"hue": "#ffffff"},
          {"saturation": -100},
          {"lightness": 100},
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "road.local",
        "elementType": "geometry",
        "stylers": [
          {"visibility": "on"},
          {"lightness": "4"},
          {"color": "#bba6aa"},
          {"saturation": "-30"}
        ]
      },
      {
        "featureType": "road.local",
        "elementType": "labels.text",
        "stylers": [
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "transit",
        "elementType": "labels",
        "stylers": [
          {"hue": "#000000"},
          {"lightness": -100},
          {"visibility": "off"}
        ]
      },
      {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
          {"hue": "#ffffff"},
          {"saturation": -100},
          {"lightness": 100},
          {"visibility": "on"}
        ]
      },
      {
        "featureType": "water",
        "elementType": "labels",
        "stylers": [
          {"hue": "#000000"},
          {"saturation": -100},
          {"lightness": -100},
          {"visibility": "off"}
        ]
      }
    ]
  })

  var marker = new google.maps.Marker({
    map: speakMap,
    position: initialLocation,
    anchorPoint: new google.maps.Point(0, -29),
    draggable: true
  })

  var input = document.getElementById('pac-input');
  speakMap.controls[google.maps.ControlPosition.TOP_LEFT].push(input);

  var autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.bindTo('bounds', speakMap);

  // Location changed by search
  autocomplete.addListener('place_changed', function() {
    marker.setVisible(false);
    var place = autocomplete.getPlace();

    if (place.geometry.viewport) {
      speakMap.fitBounds(place.geometry.viewport);
      speakMap.setCenter(place.geometry.location);
      speakMap.setZoom(15);
    } else {
      speakMap.setCenter(place.geometry.location);
      speakMap.setZoom(10);
    }

    marker.setPosition(place.geometry.location);
    updateLatLng(marker);
    marker.setVisible(true);
    $('input.tag').trigger('change');
  })

  // Location changed by drag
  google.maps.event.addListener(marker, 'dragend', function(event) {
    updateLatLng(marker);
    speakMap.setCenter(marker.getPosition());
  })
}
