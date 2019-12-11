if (! window.RoundWare) {
    window.RoundWare = {};
}

RoundWare.Recorder = function() {
    /*
       Parts of this code are Copyright 2013 Chris Wilson

       Licensed under the Apache License, Version 2.0 (the "License");
       you may not use this file except in compliance with the License.
       You may obtain a copy of the License at

           http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing, software
       distributed under the License is distributed on an "AS IS" BASIS,
       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
       See the License for the specific language governing permissions and
       limitations under the License.
    */

    window.AudioContext = window.AudioContext || window.webkitAudioContext;

    var audioContext = new AudioContext();
    var audioInput = null,
        realAudioInput = null,
        inputPoint = null,
        audioRecorder = null;
    var rafID = null;
    var analyserContext = null;
    var canvasWidth, canvasHeight;


    // value for the "Authorization: " HTTP header
    var authorization = 'Token 7da50488030ecdf43020d611687e2390c5f4e542';
    var url = 'https://prod.roundware.com/api/2/';
    var config = {
        project_id : 29,
        session_id : 1,
        client_system : navigator.userAgent,
    }

    var session = {};
    var project = {};

    var time_remaining = 0;
    var time_remaining_interval_id = -1;

    // store the audio WAV file
    var wav = null;

    // store the raw audio buffer
    var buffers = null;

    // state enum: stopped, recording, playing, undefined
    var state = undefined;

    // the AudioBufferSourceNode,
    var absNode = undefined;

    $('#record').click(recordStopPlay);
    $('#upload').click(saveSession);
    $('#re-record').click(function(){
        alertify
            .okBtn("Yes, Erase")
            .cancelBtn("No, Keep It")
            .confirm("Are you certain you want to erase the current recording and start over?", function () {
                reset();
        }, function() {
            // user clicked "cancel"
        });
    });

    /* use "logger" instead of "console" so we can easily turn it off */
    if (! console) {
        var logger = {
            error: function(){},
            warn : function(){},
            info : function(){},
            log  : function(){}
        };
    }
    else {
        var logger = console;
    }


    /**
     * called by absNode when the "ended" event triggers
     */
    function stopPlaying() {
        state = 'stopped';
        absNode.stop();
        $('#record').prop('src', 'web-recorder/images/play.png');
    }


    /**
     * Reset the player to its initial state and show a "record" button
     */
    function reset() {

        if (! audioRecorder) {
            alertify
                .okBtn("OK")
                .alert('Sorry; the audio recorder didn\'t load correctly.<br><br>'
                    + 'Recording requires a modern version of Chrome or Firefox.');
            return;
        }

        // clear the analyzer image
        if (analyserContext) {
            analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        }


        audioRecorder.clear();
        $('#record').prop('src', 'web-recorder/images/record.png');
        $('#upload-wrapper').hide();
        $('#upload').hide();
        $('#re-record-wrapper').hide();
        $('#upload-spinner').hide();
        $('#timer').css( "visibility", "hidden");

        var canvas = document.getElementById( "wavedisplay");
        drawBuffer(canvas.width, canvas.height, canvas.getContext('2d'), []);

        state = undefined;
        absNode = undefined;
    }

    // Reset fully to metadata step
    function fullReset() {
        reset();
        $('#step-tags li').removeClass('tag-selected');
        $('#step-tags input:radio').prop('checked', false);
        $('#step-1').fadeIn('300');
        $('#step-2').fadeOut('300');
    }


    /**
     * If clicked while playing, stop playing.
     * If clicked while stopped, start playing.
     * If clicked while recording, stop recording.
     * If clicked while state is undefined, start recording.
     */
    function recordStopPlay(e)
    {
        // clear the analyzer image
        if (analyserContext) {
            analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
        }

        // stop the analyzer animation
        cancelAnalyserUpdates();

        if ('playing' == state) {
            stopPlaying();
        }
        else if ('stopped' == state) {
            if (buffers) {

                state = 'playing';
                absNode = audioContext.createBufferSource();
                var audioBuffer = audioContext.createBuffer( 2, buffers[0].length, audioContext.sampleRate );
                audioBuffer.getChannelData(0).set(buffers[0]);
                audioBuffer.getChannelData(1).set(buffers[1]);
                absNode.buffer = audioBuffer;
                absNode.onended = stopPlaying;

                $('#record').prop('src', 'web-recorder/images/stop.png');

                absNode.connect( audioContext.destination );
                absNode.start(0);
            }
            else {
                alertify
                    .okBtn("OK")
                    .alert('stop: You haven\'t recorded anything yet!');
            }

        }
        else if ('recording' == state) {
            state = 'stopped';
            audioRecorder.stop();
            audioRecorder.getBuffers( gotBuffers );
            clearInterval(time_remaining_interval_id);
            $('#record').prop('src', 'web-recorder/images/play.png');
            $('#upload-wrapper').show();
            $('#upload').show();
            $('#re-record-wrapper').show();
            $('#timer').css( "visibility", "hidden");

        }
        else {
            reRecord(e);
        }
    }


    /**
     * Get a session ID from the RW server and start recording
     */
    function reRecord(event)
    {
        if (! audioRecorder) {
            alertify
                .okBtn("OK")
                .alert('Sorry; the audio recorder didn\'t load correctly.');
            return;
        }

        startCountdown();

        updateAnalysers();
        state = 'recording';
        audioRecorder.clear();
        audioRecorder.record();
        $('#record').prop('src', 'web-recorder/images/stop.png');
        $('#upload').hide();
        $('#re-record-wrapper').hide();
        $('#upload-spinner').hide();
    }


    /**
     * Cache the session and project variables given to the constructor,
     * and initialize the audio tooling.
     */
    this.initializeSession = function (s, p)
    {
        session = s;
        console.log(s);
        console.log(p);
        config.session_id = s.id;
        project = p;
        config.project_id = p.id;

        initAudio();
    }


    /**
     * read max_recording_length from the project config and then use it
     * to display a countdown-timer.
     */
    function startCountdown()
    {
        time_remaining = project.max_recording_length;
        var minutes = Math.floor(time_remaining / 60);
        var seconds = time_remaining % 60;
        $('#timer').text(minutes + ':' + ('0'+seconds).slice(-2)).css( "visibility", "visible");
        time_remaining_interval_id = setInterval(updateCountdown, 1000, time_remaining);
    }


    /**
     * callback for startCountdown: update the countdown timer until it reaches
     * 0, then clear the interval timer and trigger a click on the record/stop/play
     * button.
     */
    function updateCountdown(seconds)
    {
        time_remaining = --time_remaining;
        var minutes = Math.floor(time_remaining / 60);
        var seconds = time_remaining % 60;
        $('#timer').text(minutes + ':' + ('0'+seconds).slice(-2));

        if (0 == time_remaining) {
            clearInterval(time_remaining_interval_id);
            $('#record').trigger('click');
        }
    }


    function envelopesCallback (data) {
        logger.log(data);
        var formData = new FormData();
        formData.append('session_id', data.session_id);
        logger.log('envelope PATCH session_id: ' + data.session_id);
        formData.append('envelope_id', data.id);
        formData.append('file', wav, 'upload.wav');
        formData.append('latitude', marker.position.lat());
        formData.append('longitude', marker.position.lng());

        var tags = [];
        $.each($('input.tag:checked'), function() {
            tags.push($(this).val());
            logger.log("tags = " + tags);
        });

        formData.append('tag_ids', tags);

        $.ajax({
            url: url + 'envelopes/' + data.id + '/',
            data: formData,
            processData: false,
            type: 'PATCH',
            contentType: false,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', authorization);
            },
            success: function(data) {
                logger.log('successfully patched!', data);
                $('#upload-spinner').hide();
                logger.log(data);
                logger.log('envelope: ' + data.id);
            }
        })
        .fail(function(data) {
            logger.error('Failed to contact ' + url + 'envelopes/' + data.id + '/');
            alertify
                .okBtn("OK")
                .alert( "Your recording has not uploaded properly. Please try again or make a new recording.");
            reset();
        })
        .done(function(formData) {
            logger.info('envelope_id = ' + data.id);
            alertify
                .okBtn("OK")
                .alert("<strong>Thank you for participating!</strong> <br><br>"
                + "Your recording has been successfully uploaded. <br><br>"
                + "Click OK to proceed to your shareable contribution page.", function () {
                    var shareUrl = "s.html?eid=" + data.envelope_id;
                    logger.log("shareUrl = " + shareUrl);
                    window.location.replace(shareUrl);
                });
        });
    }


    function saveSession()
    {
        if (wav) {
            $('#upload').fadeTo(0.5);
            $('#upload-spinner').show();
            console.log("session_id = " + config.session_id);

            $.ajax({
                url: url + 'envelopes/',
                data: {"session_id": config.session_id},
                type: 'POST',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader('Authorization', authorization);
                },
                success: envelopesCallback
            })
            .fail(function(data) {
                logger.error('Failed to contact ' + url + 'envelopes/');
                alertify
                    .okBtn("OK")
                    .alert( "Your recording has not uploaded properly. Please try again or make a new recording.");
                reset();
            });
        }
        else {
            alertify
                .okBtn("OK")
                .alert('save: You haven\'t recorded anything yet!');
        }
    }


    /**
     * public function: store the wav file in "wav"
     */
    setWav = function (b)
    {
        wav = b;
    }



    /**
     * public function: store the raw audio buffers (for playback) in "buffers"
     */
    setBuffers = function (b)
    {
        buffers = b;
    }


    /* TODO:

    - offer mono option
    - "Monitor input" switch
    */

    function saveAudio() {
        // could get mono instead by saying
        // audioRecorder.exportMonoWAV( doneEncoding );
        audioRecorder.exportMonoWAV( doneEncoding );


    }

    function gotBuffers( buffers ) {
        var canvas = document.getElementById( "wavedisplay" );

        drawBuffer( canvas.width, canvas.height, canvas.getContext('2d'), buffers[0] );

        // stash the raw buffers for playback
        setBuffers(buffers);

        // export to a WAV file
        audioRecorder.exportWAV( doneEncoding );
    }

    function doneEncoding( blob ) {

        // create an object url
        var url = (window.URL || window.webkitURL).createObjectURL(blob);

        // push the WAV-encoded bu
        var request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.responseType = "blob";
        request.onload = function(){
            setWav(request.response);
        }
        request.send();
    }


    function convertToMono( input ) {
        var splitter = audioContext.createChannelSplitter(2);
        var merger = audioContext.createChannelMerger(2);

        input.connect( splitter );
        splitter.connect( merger, 0, 0 );
        splitter.connect( merger, 0, 1 );
        return merger;
    }

    function cancelAnalyserUpdates() {
        window.cancelAnimationFrame( rafID );
        rafID = null;
    }

    function updateAnalysers(time) {
        if (!analyserContext) {
            var canvas = document.getElementById("analyser");
            canvasWidth = canvas.width;
            canvasHeight = canvas.height;
            analyserContext = canvas.getContext('2d');
        }

        // analyzer draw code here
        {
            var SPACING = 3;
            var BAR_WIDTH = 1;
            var numBars = Math.round(canvasWidth / SPACING);
            var freqByteData = new Uint8Array(analyserNode.frequencyBinCount);

            analyserNode.getByteFrequencyData(freqByteData);

            analyserContext.clearRect(0, 0, canvasWidth, canvasHeight);
            analyserContext.fillStyle = '#F6D565';
            analyserContext.lineCap = 'round';
            var multiplier = analyserNode.frequencyBinCount / numBars;

            // Draw rectangle for each frequency bin.
            for (var i = 0; i < numBars; ++i) {
                var magnitude = 0;
                var offset = Math.floor( i * multiplier );
                // gotta sum/average the block, or we miss narrow-bandwidth spikes
                for (var j = 0; j< multiplier; j++)
                    magnitude += freqByteData[offset + j];
                magnitude = magnitude / multiplier;
                var magnitude2 = freqByteData[i * multiplier];
                analyserContext.fillStyle = "hsl( " + Math.round((i*360)/numBars) + ", 100%, 50%)";
                analyserContext.fillRect(i * SPACING, canvasHeight, BAR_WIDTH, -magnitude);
            }
        }

        rafID = window.requestAnimationFrame( updateAnalysers );
    }

    function toggleMono() {
        if (audioInput != realAudioInput) {
            audioInput.disconnect();
            realAudioInput.disconnect();
            audioInput = realAudioInput;
        } else {
            realAudioInput.disconnect();
            audioInput = convertToMono( realAudioInput );
        }

        audioInput.connect(inputPoint);
    }

    function gotStream(stream) {
        inputPoint = audioContext.createGain();

        // Create an AudioNode from the stream.
        realAudioInput = audioContext.createMediaStreamSource(stream);
        audioInput = realAudioInput;
        audioInput.connect(inputPoint);

        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        inputPoint.connect( analyserNode );

        audioRecorder = new Recorder( inputPoint );

        zeroGain = audioContext.createGain();
        zeroGain.gain.value = 0.0;
        inputPoint.connect( zeroGain );
        zeroGain.connect( audioContext.destination );

        // don't start the animation loop unless request
    }

    function initAudio() {
        if (! navigator.mediaDevices) {
            navigator.mediaDevices = {};
            navigator.mediaDevices.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        }

        if (!navigator.cancelAnimationFrame)
            navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
        if (!navigator.requestAnimationFrame)
            navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;

        navigator.mediaDevices.getUserMedia(
            {
                "audio": {
                    "mandatory": {
                        "googEchoCancellation": "false",
                        "googAutoGainControl": "false",
                        "googNoiseSuppression": "false",
                        "googHighpassFilter": "false"
                    },
                    "optional": []
                },
            })
            .then(gotStream)
            .catch(function(e) {
                alertify
                    .okBtn("OK")
                    .alert('Error getting audio<br><br>'
                    + 'Most likely, you have either not given permission for your browser '
                    + 'to connect to your microphone or your browser is not a modern version '
                    + 'of Chrome or Firefox which is required.');
                console.log(e);
            });
    }

    return this;

}
