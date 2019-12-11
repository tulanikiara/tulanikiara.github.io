var MicrophonePlugin;
var wavesurferInput;
var time_remaining = 0;
var time_remaining_interval_id = -1;

function initRecording() {
  var recorder;
  var wavesurfer;
  var recordButton = document.getElementById("recordButton");
  var rerecordButton = document.getElementById("rerecordButton");
  var uploadButton = document.getElementById("uploadButton");
  var recordButtonCaption = document.getElementById("recordButtonCaption");
  recordButtonCaption.innerHTML = "Record";
  $('#re-record-wrapper').hide();
  $('#upload-wrapper').hide();
  var dataBlob;
  var wavFileName;
  var url;
  var state = "undefined"; // state enum: undefined, recording, stopped, playing


  // for future reference, if anything needs to be triggered post-recorder init, do this:
  recordButton.addEventListener( "click", function(){
    switch(state) {
      case "undefined":
        if (bowser.ios && bowser.safari) {
          console.log("Mobile safari detected. Disabled level meter visualization.");
          recorder.start();
        } else {
          recorder.start().then(() => visualize());
        }
        $('#recordButton').prop('src', 'web-recorder/images/stop.png');
        recordButtonCaption.innerHTML = "Stop";
        state = "recording";
        break;
      case "recording":
        recorder.stop();
        $('#recordButton').prop('src', 'web-recorder/images/play.png');
        recordButtonCaption.innerHTML = "Play";
        state = "stopped";
        break;
      case "stopped":
        wavesurfer.playPause();
        $('#recordButton').prop('src', 'web-recorder/images/stop.png');
        recordButtonCaption.innerHTML = "Stop";
        state = "playing";
        break;
      case "playing":
        wavesurfer.playPause();
        $('#recordButton').prop('src', 'web-recorder/images/play.png');
        recordButtonCaption.innerHTML = "Play";
        state = "stopped";
        break;
    }
  });

  if (!Recorder.isRecordingSupported()) {
    console.log("Recording features are not supported in your browser.");
  }

  recorder = new Recorder({
    monitorGain: 0,
    // numberOfChannels: parseInt(numberOfChannels.value, 10),
    // wavBitDepth: parseInt(bitDepth.value,10),
    encoderPath: "./web-speak/waveWorker.min.js"
  });

  recorder.onstart = function(){
    console.log('Recorder is started');
    startCountdown();
  };

  recorder.onstop = function(){
    console.log('Recorder is stopped');
    wavesurferInput.microphone.stop();
    resetCountdown();
  };

  recorder.onstreamerror = function(e){
    console.log('Error encountered: ' + e.error.name );
  };

  recorder.ondataavailable = function( typedArray ){
    $('#re-record-wrapper').show();
    $('#upload-wrapper').show();
    dataBlob = new Blob( [typedArray], { type: 'audio/wav' } );
    wavFileName = new Date().toISOString() + ".wav";
    url = URL.createObjectURL( dataBlob );

    // display waveform with wavesurfer.js
    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: 'red',
      progressColor: 'purple',
      barWidth: 2,
    });
    wavesurfer.load(url);
    wavesurfer.on('ready', function () {
      console.log("wavesurfer ready to display waveform");
    });
  };

  rerecordButton.addEventListener( "click", function(){
    recorder.clearStream();
    if (!(bowser.ios && bowser.safari)) {
      wavesurferInput.destroy();
    }
    wavesurfer.destroy();
    state = "undefined";
    $('#recordButton').prop('src', 'web-recorder/images/record.png');
    recordButtonCaption.innerHTML = "Record";
    $('#re-record-wrapper').hide();
    $('#upload-wrapper').hide();
  });

  function valiateRadioButtons()
  {
    var warningMessage = "Please answer each question above.";
    var speakTagIds = $("#uiSpeakDisplay input:checked").map(function() {
      return this.value;
    }).get().join();
    var radionbutn_clicked = JSON.stringify(speakTagIds);
    var counts = radionbutn_clicked.split(",");
    if( counts.length == 1 )
    {
      console.log("Verified the radio buttons were clicked.")
      return true;
    }
    else{
      console.log(warningMessage)
    }
    return false;
  }

  uploadButton.addEventListener("click", function() {

    if( !valiateRadioButtons() ){
      let warningMessage = "Please answer each question above.";
      alertify
          .okBtn("OK")
          .alert(warningMessage);
          return;
    }
    var termsMessage = "By uploading your recording, you agree that any recordings that you make with this app will become a part of Promenade. Additionally, you authorize your recording to be used by Tulani and Halsey Burgund for this project and any related purposes.";
    var confirmationMessage = "<i class='far fa-check-circle fa-3x' style='color: green;'></i><br>" + "Your recording was submitted. Thank you!";

    alertify
      .okBtn("Agree")
      .cancelBtn("Deny")
      .confirm(termsMessage, function() {
        var data = {};
        var speakTagIds = $("#uiSpeakDisplay input:checked").map(function() {
          return this.value;
        }).get().join();

        if (speakTagIds != "") {
          data = {
            "tag_ids": speakTagIds,
            "latitude": localStorage.getItem("lullaby_lat"),
            "longitude": localStorage.getItem("lullaby_lng")
          };
        } else {
          data = {
            "latitude": localStorage.getItem("lullaby_lat"),
            "longitude": localStorage.getItem("lullaby_lng")
          };
        };
        roundware.saveAsset(dataBlob, wavFileName, data).then(function() {
          console.log("Recording uploaded");
        });

        alertify
          .okBtn("Close")
          .cancelBtn("Listen to others")
          .confirm(confirmationMessage, function() {
            window.location.replace("speak.html")
          }, function() {
            window.location.replace("map.html")
          });
      }, function() {});
  });
}

// input meter visual display
function visualize() {
  console.log("visualizing!");

  wavesurferInput = WaveSurfer.create({
    container: '#inputmeter',
    waveColor: 'red',
    height: 128,
    barWidth: 2,
    barHeight: 1.2,
    cursorWidth: 0,
    plugins: [
      WaveSurfer.microphone.create()
    ]
  });
  // MicrophonePlugin.play;
  // microphone = Object.create(WaveSurfer.Microphone);
  // microphone.init({
  //   wavesurfer: wavesurferInput
  // });
  wavesurferInput.microphone.on('deviceReady', function(stream) {
      console.log('Device ready!', stream);
  });
  wavesurferInput.microphone.on('deviceError', function(code) {
      console.warn('Device error: ' + code);
  });
  wavesurferInput.microphone.start();
  // // MicrophonePlugin.on('deviceReady', function(stream) {
  // MicrophonePlugin.deviceReady = function(stream){
  //
  //   console.log('Microphone ready!', stream);
  // };
  // // MicrophonePlugin.on('deviceError', function(code) {
  // MicrophonePlugin.deviceError = function(code){
  //   console.log('Microphone error: ' + code);
  // };
}

/**
 * read max_recording_length from the project config and then use it
 * to display a countdown-timer.
 */
function startCountdown() {
  time_remaining = roundware._project.maxRecordingLength;
  var minutes = Math.floor(time_remaining / 60);
  var seconds = time_remaining % 60;
  // console.log( hours +':'+ ('0'+minutes).slice(-2) +':'+ ('0'+seconds).slice(-2) );
  $('#countdown').text(minutes + ':' + ('0'+seconds).slice(-2)).css( "visibility", "visible");
  time_remaining_interval_id = setInterval(updateCountdown, 1000, time_remaining);
}

/**
 * callback for startCountdown: update the countdown timer until it reaches
 * 0, then clear the interval timer and trigger a click on the record/stop/play
 * button.
 */
function updateCountdown(seconds) {
  time_remaining = --time_remaining;
  var minutes = Math.floor(time_remaining / 60);
  var seconds = time_remaining % 60;
  $('#countdown').text(minutes + ':' + ('0'+seconds).slice(-2));

  if (time_remaining <= 0) {
      clearInterval(time_remaining_interval_id);
      $('#recordButton').trigger('click');
  }
}

// reset counter to max recording length

function resetCountdown() {
  var minutes = Math.floor(roundware._project.maxRecordingLength / 60);
  var seconds = roundware._project.maxRecordingLength % 60;
  $('#countdown').text(minutes + ':' + ('0'+seconds).slice(-2));
  clearInterval(time_remaining_interval_id);
}
