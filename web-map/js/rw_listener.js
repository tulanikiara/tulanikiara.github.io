/**
 * This object provides a jQuery interface to the Roundware server. The basic
 * usage is Roundware.listen_main(project_id) or Roundware.speak_main(project_id)
 * where project_id is the integer identifier of a project on the Roundware server.
 *
 */
var Roundware = {

    // URL of the RW server
    url : 'proxy.php',

    // speak form button URLs
    record_button : 'images/RECORD-button.png',
    stop_button   : 'images/STOP-button.png',
    play_button   : 'images/STOP-button.png',
    submit_button : 'images/submit-button-off.png',

    // HTML id attribute of the speak form
    speak_form_id : '#upload_form',

    // name of the form-field the recording will be attached to. this must be synced
    // with proxy.php in order for the recording to be properly attached to the
    // submission's POST values
    speak_upload_field : 'file',


    //
    // NOTHING TO CONFIGURE BELOW
    //

    // identifier for this project; passed into listen_main or speak_main
    // by the calling HTML page and provided to the RW server
    project_id : null,

    // name given to the Flash recording app, in order to delegate JS events to it
    speak_app_name : 'recorderApp',

    // collection of device config params returned from the RW server
    device : null,

    // roundware identifier for this session; returned by the RW server
    session_id : null,

    // details about this project; returned by the RW server
    project : null,

    // max recording time in seconds; returned by the RW server in the project settings
    max_recording_length : 0,

    // name of the timeout function, so we can remove the handler when we're done
    timeout_handler : null,


    // geocoding default values
    geoconfig : {
        map_frame_id: "mapframe",
        map_window_id: "mapwindow",
        lat_id: "latitude",
        lng_id: "longitude",
        addr_id: "filter_address",
        lat: $('#latitude').val(),
        lng: $('#longitude').val(),
        map_zoom: 13,
    },


    /**
     * Retrieve a project config from the RW server, then call callback for
     * post-processing.
     *
     * @param project_id ID for this project
     * @param callback method to call once the RW session is established
     */
    init : function(project_id, callback)
    {
        Roundware.project_id = project_id;

        $.ajax({
            url: Roundware.url + '?operation=get_config&project_id=' + project_id,
            dataType: 'json',
            success: function(data) {
                Roundware.session_init(data, callback);
            },
            error: function(data) {
                console.log('session init failure');
            }
        });

    },



    /**
     * AJAX call back for session initialization
     *
     * @param data JSON object from the RW server
     * @param callback method to call once session init is complete
     */
    session_init : function(data, callback)
    {
        $.each(data, function(i, item) {
            if (item.device) {
                Roundware.device = item.device;
            }

            if (item.session) {
                Roundware.session_id = item.session.session_id;
            }

            if (item.project) {
                Roundware.project = item.project;
            }
        });

        callback();
    },

    //
    // LISTEN METHODS from roundware.js
    //

    listen_main : function(project_id) {
        Roundware.init(project_id, Roundware.listen_form);

        Roundware.iOSdevice = ( navigator.userAgent.match(/(iPad|iPhone|iPod)/i) ? true : false );
        //detect Firefox to warn of streaming issue
        var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        if (is_firefox) {
            alert("Unfortunately, Firefox is unable to stream mp3 audio.  Please use a different browser such as Chrome or Safari to listen.\n\nSorry for the inconvenience and thanks!");
        }

        if (Roundware.iOSdevice) {
            $('.full-float-block').first().remove();
            $('#content').prepend('<div class="full-float-block" id="audio-container"><input type="button" class="jp-play" value="Listen" /><center><div id="spinner-1" class="spinner"><img src="/images/ajax-loader.gif"/><span><em>Updating the stream...</em><span></div></center></div>');

        } else {
            $("#jquery_jplayer_1").jPlayer({
                ready: function () {
                    // TODO: cleanup, as mp3 path does not exist
                    // $(this).jPlayer("setMedia", {
                    //     mp3: "http://prod.roundware.com:8000/stream4567.mp3"
                    // });
                },
                swfPath: "http://halseyburgund.com/dev/deeptime/rw",
                supplied: "mp3",
                preload: "auto"
            });
        }

            $('.jp-play').click(function(){ Roundware.listen(); });
            $("#update-stream").click(function(){ Roundware.show_spinner('Updating the stream...', 2); Roundware.modify_stream(); });
    },

    show_spinner : function(text, index) {
        if (!index) { index = 1; }
        var numLow = 3;
        var numHigh = 6;

        var adjustedHigh = (parseFloat(numHigh) - parseFloat(numLow)) + 1;

        var numRand = Math.floor(Math.random()*adjustedHigh) + parseFloat(numLow);
        var whichSpinner = '#spinner-' + index;
        $(whichSpinner + ' span').html('<em>' + text + '</em>');
        $(whichSpinner).css({visibility: 'visible'});
        $(whichSpinner).fadeIn(300).delay(numRand * 1000).fadeOut(300);
    },

    /**
    * function to init google map
    *
    */

    init_map : function() {
        var centerLat = 60;
        var centerLon = 20;

        var myOptions = {
            scrollwheel: false,
            zoom: 2,
            center: new google.maps.LatLng(centerLat, centerLon),
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };

        Roundware.demoMap = new google.maps.Map(document.getElementById("mapblock"), myOptions);
        $('#instruction-block').show();
        $('#instruction-block').html('<span>Select</span>');
    },


    /**
     * Generate an HTML form for managing the a stream a user is listening to. 
     * AJAX callback. 
     */
    listen_form : function() {
        $.ajax({
            url: Roundware.url + '?operation=get_tags&project_id=' + Roundware.project_id + '&session_id=' + Roundware.session_id,
            dataType: 'json',
            success: function(data) {
            console.log("data.listen = " + data.listen);
            $('.full-float-block').eq(0).append('<div class="clear"></div>'+Roundware.parse_tags(data.listen));
            $('.full-float-block h2').eq(1).remove();
            var checkboxes = $("input[type='checkbox']");
            var checkboxLabels = checkboxes.parent().find('label');
            checkboxLabels.css({backgroundColor: '#6b3c02'});
            checkboxLabels.click(
                function() {
                    var cbox = $(this).parent().find('input');
                    if (cbox.hasClass('tag')) {
                        cbox.removeClass('tag');
                        $(this).css({backgroundColor: '#666666'});
                    }
                    else {
                        $(this).css({backgroundColor: '#6b3c02'});
                        cbox.addClass('tag');
                    }

                }
            );

            },
            error: function(data) {
                console.log('could not retrieve tags to generate a form');
            }
        });

    },

    /**
     * Construct and return a URL to use for a request_stream or modify_stream request. 
     * @param string operation: name of the operation to add to the URL, i.e. request_stream or modify_stream
     * @return string a URL
     */
    get_url : function(operation) {
        var l = $('input.tag:checked').map(function() {
              return this.value;
            }).get().join(',');
        console.log(l);
        var url = 'proxy.php?operation=' + operation + '&session_id=' + Roundware.session_id + '&tags=' + l;

        console.log('url is ' + url);

        return url;
    },

    /**
     * Request an audio stream to listen to
     */
    listen : function() {

        if ($(".tag").size() < 2) {
            alert("Please select at least one option from each question/column and try again.\n\nThanks!");
            return;
        }

        Roundware.show_spinner('Generating audio stream...', 1);

        if (!Roundware.iOSdevice) {
            $("#jquery_jplayer_1").jPlayer("destroy");
        } else {
            $('#audio-container input').remove();
        }

        $.ajax({
            url: Roundware.get_url('request_stream'),
            dataType: 'json',
            success: function(data) {

                if (!Roundware.iOSdevice) {
                    $("#jquery_jplayer_1").jPlayer({
                            ready: function () {
                              $(this).jPlayer("setMedia", {
                                mp3: data.stream_url
                              }).jPlayer("play");
                            },
                            swfPath: "../js",
                            supplied: "mp3",
                            preload: "none"
                    });
                } else {
                    $('#audio-container').append('<div><audio autoplay="autoplay" controls="controls"><source src="'+ data.stream_url +'" type="audio/mpeg" />Your browser does not support the audio element.</audio></div>');
                }

                Roundware.modify_stream();
                $('#update-stream').show();
            },
            error: function(data) {
                console.log('stream listen failure');
            }
        });
    },

    /**
     * update the existing audio stream 
     */
    modify_stream : function() {

        $.ajax({
            url: Roundware.get_url('modify_stream'),
            dataType: 'json',
            success: function(data) {
            },
            error: function(data) {
                console.log('stream modify failure');
            }
        });
    },

    //
    // END LISTEN FUNCTIONS
    //

    /**
     * Given a list of tags as a JSON array, convert them into an HTML string and return them.
     */
    parse_tags : function(data)
    {
        var str = '';
        $.each(data, function(i, item) {
            str += '<li>' + item.name + '<br />';
            if (item.select == 'single') {
                str += Roundware.show_single(item);
            }
            else if (item.select == 'multi') {
                str += Roundware.show_multi(item);
            }
            else if (item.select == 'multi_at_least_one') {
                str += Roundware.show_multi(item);
            }
            str += '</li>';
        });

        return str;
    },



    /**
     * Given a JSON object representing a select-one item, convert it to an HTML select item
     * and return it.
     *
     * @param field
     * @returns {String}
     */
    show_single : function(field)
    {
        var str = '<select name="' + field.code + '" id="' + field.code + '" class="tag"><option />';
        $.each(field.options, function(i, item) {
            var selected = '';
            $.each(field.defaults, function(j, field_default) {
                if (field_default == item.tag_id) {
                    selected = 'selected';
                }
            });

            str += '<option value="' + item.tag_id + '" ' + selected + '>' + item.value + '</option>';

        });

        str += '</select>';
        return str;
    },



    /**
     * Given a JSON object representing a select-multi item, convert it to a string of
     * HTML checkboxes and return it.
     *
     * @param field
     * @returns {String}
     */
    show_multi : function(field)
    {
        var str = '';

        $.each(field.options, function(i, item) {
            var checked = '';
            $.each(field.defaults, function(j, field_default) {
                if (field_default == item.tag_id) {
                    checked = 'checked';
                }
            });
            str += '<input type="checkbox" name="' + item.code + '[]" id="' + item.code + '[]" class="tag" value="' + item.tag_id + '" ' + checked + '>' + item.value + '<br />';
        });

        return str;
    },

};

