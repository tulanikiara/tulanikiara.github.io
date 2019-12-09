// make sure we have a valid namespace
if (! Roundware) {
    var Roundware = function() {};
}

/**
 * The Roundware.ListenMap constructor returns an object with a single public function
 * (main) which is in turn called with a project ID and a Google Map for plotting
 * recordings.
 *
 * The public callback to main iterates over the functions specified by RW.workflow
 * to grab a projects config, tags, and assets from the Roundware server, display
 * recordings on the map and tags as a list of filters, and then adds event listeners
 * to UI elements to allow you to listen to and modify the audio stream.
 *
 * Project tags are displayed as a list of checkboxes which can be toggled on/off
 * to show/hide recordings on the map and to modify the stream. Moving the listening
 * pin will also cause the stream to be modified based on its new lat/lng.
 *
 * @author Zak Burke, zak.burke@gmail.com
 *
 *
 */
Roundware.ListenMap = function(opts)
{
	let roundwareAuthToken = '';

	var options = $.extend({}, {
        url     : roundwareServerUrl + '/api/1/',
        url2    : roundwareServerUrl + '/api/2/'
    }, opts);

	var project_id = null;
	var project_lat = null;
	var project_lon  = null;

	var config = {};
    config.session = {};
    config.project = {};
	var tags   = null;
	var assets = null;
	var asset_tags = [];
	var map = null;
	var all_assets = [];
	var markerCluster;
	var iOSdevice = false;
	var is_listening = false;

	var listening_pin = null;
    var listener_circle = null;
    var use_listener_range = false;
    var firstplay = true;


	// ordered lists of methods to be called in series
	var workflow = [
		fetch_auth_token,
        create_session,
        get_project,
		get_tags,
		get_asset_tags,
		get_assets,
		map_assets,
		add_listening_pin,
		show_filters,
        add_listener_range
		];


	/**
	 * cache the input parameters, then grab data from RW and display filters and
	 * map of recordings, speakers, and a listening pin. The workhorse here is
	 * main_callback(), which loops through the methods of RW.workflow to retrieve
	 * the data and display it.
	 *
	 * @param string m_url: URL of the roundware server, e.g. http://prod.roundware.com/roundware/
	 * @param int m_project_id: project PK on the roundware server
	 * @param google.maps.Map m_map: a Google Map
	 */
	this.main = function(m_project_id, m_map)
	{
		project_id = m_project_id;
		map = m_map;

		// step through the methods named by workflow
		main_callback();

		//
		// event listeners
		//

		// listen to or pause the stream
		$('#play').on('click', listen);

		// update the stream
		$("#update-stream").click(function(){
			show_spinner(5000);
			modify_stream();
		});

		// change tag selections
		$('#filter-tags').on('click', 'input.tag', filter_click);

		// show project config details
		$('#project-config-toggle').on('click', function(){ $('#project-config').toggle(); });
	}


	/**
	 * show/hide elements on the map based on what tags are checked
	 */
	function filter_click(event)
	{
		var tag_label = $(this).parent('label');
		var count;
		if (!$(this).hasClass('tag-selected')) {
			console.log("toggle on");
			tag_label.prop('style', 'color: #000000 !important; background-color: #ffffff');
			tag_label.next("div.check").show();
			$(this).addClass('tag-selected');
			console.log($(this).val());
			count = $(".filtering-options li .tag-selected").length;
			console.log("count = " + count);
		}
		else {
			console.log("toggle off");
			tag_label.attr('style', 'color: #a0a0a0 !important; background-color: #d4d4d4');
			tag_label.next("div.check").hide();
			$(this).removeClass('tag-selected');
			count = $(".filtering-options li .tag-selected").length;
			console.log("count = " + count);
		}

		var tag_id = $(this).context.id.split(/\-/)[1];
		if (0) {
            console.log("filter_and");
			filter_and();
		}
		else
		{
			filter_or(tag_id, $(this).context.checked);
            console.log("filter_or for tag_id:" + tag_id);
            console.log(all_assets);
		}
		if (count == 0) {
			$(".filtering-options li").children('checkbox').addClass('tag-selected');
			console.log("count = 0!");
		}

		if (is_listening) {
			modify_stream2();
		}
		console.log("items selected = " + $(".filtering-options li .tag-selected").length);

	}


	/**
	 * filter visible assets, showing only those that match all checked tags.
	 */
	function filter_and()
	{
		$.each(all_assets, function(i, item) {
			var is_visible = true;

			$.each($('input.tag:checked'), function(j, tag) {
				var tag_id = tag.id.split(/\-/)[1];
				if (! item.has_tag(tag_id))
				{
					is_visible = false;
					return;
				}
			});
			item.setVisible(is_visible);
			item.circle.setVisible(is_visible);
		});
	}


	/**
	 * filter visible assets, showing only those that match one or more checked tags.
	 */
	function filter_or(tag_id, is_on)
	{
		$.each(all_assets, function(i, item) {
			if (item.has_tag(tag_id)) {
				item.setVisible(is_on);
			}
		});
	}


	/**
	 * pluck the first item off the workflow list and call it. this method is assigned
	 * as a callback for each of the workflow functions, so this steps through the
	 * workflow in a synchronous manner, making sure each step is complete before
	 * calling the next one.
	 */
	function main_callback()
	{
		$('#voicemap-loading').show();
		if (workflow.length)
		{
			var fx = workflow.shift();
			fx();
		}
		else
		{
			$('#voicemap-loading').hide();
		}
	}


	/**
	 * call RW's get_config for the project. get_config's datastructure is an array rather
	 * than a hash, even though the values are named hashes. this means we have to loop
	 * through the array to collect the names of the hashes in order to have convenient
	 * properties like config.project.project_id.
	 *
	 * The following values are pulled from the config call: device, session, project,
	 * server, speakers, audiotracks. Anything else returned will be ignored.
	 *
	 */
	function get_config()
	{
		$.ajax({
			url: options.url + '?operation=get_config&project_id=' + project_id,
			dataType: 'json',
			success: function(data) {
				var fields = {'device' : '', 'session' : '', 'project' : '', 'server' : '', 'speakers' : '', 'audiotracks' : ''};
				$.each(data, function(i, item){
					$.each(fields, function (key, val) {
						if (item[key]) {
							config[key] = item[key];
							return false;
						}
					});

				});

				main_callback();
			},
			error: function(data) {
				console.error('could not retrieve config');
			}
		});
	}

	function fetch_auth_token() {
		let bowser = window.bowser.detect(window.navigator.userAgent);
		let requestBody = JSON.stringify({
			'device_id': '12345', // TODO: store UUID as cookie in the browser so we can detect unique users on site
			'client_type': bowser.mobile ? 'mobile' : 'desktop',
			'client_system': bowser.osname
		});

		$.ajax({
			url: options.url2 + 'users/',
			data: requestBody,
			type: 'POST',
			beforeSend: function (xhr) {
				xhr.setRequestHeader('content-type', 'application/json');
			},
			error: function (data) {
				console.log('Failed to create user:');
				console.log(data);
			},
			success: function (data) {
				roundwareAuthToken = 'Token ' + data.token;
				main_callback();
			}
		});
	}

	function create_session()
    {
        data = JSON.stringify({"project_id"  : project_id,
                "client_system" : "website"});
        $.ajax({
            url: options.url2 + 'sessions/',
            data: data,
            type: 'POST',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
                xhr.setRequestHeader('content-type', 'application/json');
            },
            error: function(data) {
                console.log("sessions/ request failed: "); console.log(data);
            },
            success: function(data) {
                console.log("session obtained: " + data.id);
                config.session.session_id = data.id;
                main_callback();
            }
        });
    }

    function get_project()
    {
        $.ajax({
            url: options.url2 + 'projects/' + project_id + '/' + '?session_id=' + config.session.session_id,
            type: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
            error: function(data) {
                console.log("projects/ request failed: "); console.log(data);
            },
            success: function(data) {
                console.log("project data obtained: " + data.id);
                config.project.recording_radius = data.recording_radius;
                config.project.latitude = data.latitude;
                config.project.longitude = data.longitude;
                main_callback();
            }
        });
    }

	/**
	 * call RW's get_tags for the project
	 */
	function get_tags()
	{
		$.ajax({
			url: options.url + '?operation=get_tags&project_id=' + project_id,
			dataType: 'json',
			success: function(data) {
				tags = data.listen;
				tags.sort(tag_sort);
				main_callback();
			},
			error: function(data) {
				console.error('could not retrieve tags');
			}
		});
	}

    function get_asset_tags()
    {
		$.ajax({
			// eventually should only get tags for project_id, but bad data cause failure, so this is workaround
			url: roundwareServerUrl + '/api/2/tags/',
			dataType: 'json',
			type: 'GET',
			beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
			success: function(data) {
				asset_tags = data;
				main_callback();
			},
			error: function(data) {
				console.error('could not retrieve tags');
			}
		});
	}


	/**
	 * call RW's get_available_assets for the project
	 */
	function get_assets()
	{
		$.ajax({
			url: roundwareServerUrl + '/api/2/assets/?media_type=audio&submitted=true&project_id=' + project_id,
			dataType: 'json',
			type: 'GET',
			beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
			success: function(data) {
        assets = data;
				main_callback();
			},
			error: function(data) {
				console.error('could not retrieve assets');
			}
		});
	}


	/**
	 * return an HTML string to be used as a marker's info window
	 */
	function create_info_window(id, descp, fn, fnwav, id)
	{
		var marker_div = '<div class="markerDiv">'+descp+'<br /><audio controls="controls" preload="metadata"><source src="'+ fn +'" type="audio/mpeg" /><source src="'+ fnwav +'" type="audio/wav" /><object type="application/x-shockwave-flash" data="js/player.swf" id="audioplayer'+id+'" height="24" width="290"><param name="movie" value="js/player.swf"><param name="FlashVars" value="playerID='+id+'&amp;soundFile='+ fn +'&titles='+descp+'"><param name="quality" value="high"><param name="menu" value="false"><param name="wmode" value="transparent"></object></audio></div>';
		var iw = new google.maps.InfoWindow({
			content: marker_div
		});
		iw.setZIndex(150);

		return iw;
	}



	/**
	 * instantiate a new google.maps.Marker and return it
	 */
	function create_marker(item, iw, color)
	{
        var marker_img = {
            url: 'images/yellow-map-marker.png',
            size: new google.maps.Size(30, 30),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(8, 8),
            scaledSize: new google.maps.Size(16,16)
        };
		var point = new google.maps.LatLng(item.latitude, item.longitude);

		var marker = new google.maps.Marker({
			position: point,
			map: map,
			icon: marker_img
		});

		marker.infoWindow = iw;
		marker.rw_tags = [];
		if (item.tag_ids) {
			marker.rw_tags = item.tag_ids;
		}
		marker.has_tag = function(tag_id) {
			var has_tag = false;
			$.each(this.rw_tags, function(i, tag) {
                console.log("has_tag: " + tag);
				if (tag == tag_id)
				{
					has_tag = true;
					return;
				}
			});
            console.log("has_tag = " + has_tag);
			return has_tag;
		}

		// on click, close all other markers' windows and then open this one
		google.maps.event.addListener(marker, 'click', function() {
			for (var i = 0; i < all_assets.length; i++)
			{
				all_assets[i].infoWindow.close();
			}
			marker.infoWindow.open(map, marker);
		});


		return marker;
	}


	/**
	 * add assets to the map
	 */
	function map_assets()
	{
		$.each(assets, function(i, item) {
            if (!item.submitted || item.media_type != 'audio')
			{
				return;
			}

			// add this item's tags' data to info window description string
			var desc = [];
			$.each(item.tag_ids, function(j, tag_id) {
				tag_string = asset_tags.filter(function( obj ) {return obj.id == item.tag_ids[j]});
				desc.push('<div class=\"ib_' + tag_string[0].tag_category_id + '\">' + tag_string[0].msg_loc + '</div>');
			});

      var fnmp3 = roundwareServerUrl + "/rwmedia/" + item.filename.replace("wav","mp3");
			var id = item.id;
			var iw = create_info_window(id, desc.join(' '), fnmp3, item.asset_url, id);
			var marker = create_marker(item, iw, 'blue');
      var radius = config.project.recording_radius || 5;

			all_assets.push(marker);

			var circle = {
				strokeColor: '#6292CF',
				strokeOpacity: 0.8,
				strokeWeight: 1,
				fillColor: '#6292CF',
				fillOpacity: .2,
				map: map,
				center: new google.maps.LatLng(item.latitude, item.longitude),
				radius: radius
				};

		});

		main_callback();
	}


	/**
	 * add speakers to the map
	 */
	function map_speakers()
	{
		$.each(config.speakers, function(i, item) {

			var marker_div = '<div class="markerDiv"><h1>Speaker ID: '+item.id+'</h1><h2><a href="'+item.uri+'">'+item.uri+'</a></h2><h2>min distance: '+item.mindistance+'</h2><h2>max distance: '+item.maxdistance+'</h2><audio controls="controls"><source src="'+ item.uri +'" type="audio/mpeg" /><source src="'+ item.uri +'" type="audio/wav" /><object type="application/x-shockwave-flash" data="js/player.swf" id="audioplayer'+item.id+'" height="24" width="290"><param name="movie" value="js/player.swf"><param name="FlashVars" value="playerID='+item.id+'&amp;soundFile='+ item.uri +'"><param name="quality" value="high"><param name="menu" value="false"><param name="wmode" value="transparent"></object></audio></div>';

			var iw = new google.maps.InfoWindow({
				content: marker_div
			});

			var marker = create_marker(item, iw, 'yellow');

			var circle = {
				strokeColor: '#111111',
				strokeOpacity: 0.8,
				strokeWeight: 1,
				fillColor: '#111111',
				fillOpacity: 0.25,
				map: map,
				center: new google.maps.LatLng(item.latitude, item.longitude),
				radius: item.maxdistance
				};
			marker.circle = new google.maps.Circle(circle);
		});

		main_callback();
	}


	/**
	 * Add draggable listening pin that can be dragged to a new location to hear the
	 * audio as streamed from that location.
	 */
	function add_listening_pin()
	{
		console.log("pin lat: = " + config.project.latitude);
		map.setCenter(new google.maps.LatLng(config.project.latitude, config.project.longitude));
		var marker_img = {
            url: 'images/red-map-marker.png',
            size: new google.maps.Size(30, 30),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(11, 11),
            scaledSize: new google.maps.Size(22,22)
        };
		listening_pin = new google.maps.Marker({
			position: map.getCenter(),
			map: map,
			icon: marker_img,
			draggable: true
		});

		google.maps.event.addListener(listening_pin, "dragend", function(event) {
            var listener_location = listening_pin.getPosition();
            listener_circle_max.setCenter(new google.maps.LatLng(listener_location.lat(),listener_location.lng()));
            listener_circle_min.setCenter(new google.maps.LatLng(listener_location.lat(),listener_location.lng()));
            if (use_listener_range) {
                modify_stream2(lr_max, lr_min);
            }
            else {
                modify_stream();
            }
        });

		main_callback();
	}


    /**
     * Add editable circle centered on listener pin that defines the listener_range
     * every time circle is edited, a PATCH streams/ is sent with lat/lon and listener_range
     */
    function add_listener_range() {
        var mapCenter = new google.maps.LatLng(config.project.latitude, config.project.longitude);
        listener_circle_max = new google.maps.Circle({
            strokeColor: '#000000',
            strokeOpacity: 0.4,
            strokeWeight: 1,
            fillColor: '#000000',
            fillOpacity: 0.08,
            map: map,
            center: mapCenter,
            radius: config.project.recording_radius * 10,
            editable: true,
            draggable: false,
            geodesic: true
        });
        listener_circle_min = new google.maps.Circle({
            strokeColor: '#000000',
            strokeOpacity: 0,
            strokeWeight: 2,
            fillColor: '#000000',
            fillOpacity: 0,
            map: map,
            center: mapCenter,
            radius: 0,
            editable: false,
            draggable: false,
            geodesic: true
        });
        map.setCenter(mapCenter);

        google.maps.event.addListener(listener_circle_max, "radius_changed", function (event) {
            lr_max = Math.round(listener_circle_max.getRadius());
            lr_min = 0;
            // ensure listener_range_max isn't smaller than listener_range_min
            if (lr_max < lr_min) {
                listener_circle_max.setRadius(lr_min);
                console.log("maximum range can't be smaller than minimum range!")
            }
            // if radius smaller than project.recording_radius, turn off listener_range filtering
            if (lr_max < config.project.recording_radius) {
                listener_circle_max.setOptions({
                    fillColor: '#000000',
                    strokeColor: '#000000'
                });
                use_listener_range = false;
                console.log("use_listener_range = " + use_listener_range);
                return;
            }
            modify_stream2(lr_max, lr_min);
            console.log("max range = " + lr_max);
            use_listener_range = true;
            // change fill color to #FF0000 to indicate it is active
            listener_circle_max.setOptions({
                fillColor: '#000000',
                strokeColor: '#000000',
                fillOpacity: 0.20
            });
        });
        google.maps.event.addListener(listener_circle_min, "radius_changed", function (event) {
            lr_min = 0;
            lr_max = Math.round(listener_circle_max.getRadius());
            // ensure listener_range_min isn't larger than listener_range_max
            if (lr_min > lr_max) {
                listener_circle_min.setRadius(lr_max);
                console.log("minimum range can't be bigger than maximum range!")
            }
            // if radius smaller than project.recording_radius, turn off listener_range filtering
            if (lr_min < config.project.recording_radius) {
                listener_circle_min.setOptions({
                    fillColor: '#000000',
                    strokeColor: '#000000'
                });
                use_listener_range = false;
                console.log("use_listener_range = " + use_listener_range);
                return;
            }
            modify_stream2(lr_max, lr_min);
            console.log("min range = " + lr_min);
            use_listener_range = true;
            // change fill color to #FF0000 to indicate it is active
            listener_circle_min.setOptions({
                fillColor: '#FF0000',
                strokeColor: '#FF0000'
            });
            listener_circle_max.setOptions({
                fillColor: '#000000',
                strokeColor: '#000000',
                fillOpacity: 0.20
            });
        });

        main_callback();
    }

	/**
     * Construct and return a URL to use for a request_stream or modify_stream request.
     * @param string operation: name of the operation to add to the URL, i.e. request_stream or modify_stream
     * @return string a URL
     */
    function get_url(operation, lat, lng)
    {
        var l = $('input.tag:checked').map(function() {
              return this.value;
            }).get().join(',');

        var url = options.url + '?operation=' + operation + '&session_id=' + config.session.session_id + '&tags=' + l;

		var listener_location = listening_pin.getPosition();
		url += '&latitude=' + listener_location.lat() + '&longitude=' + listener_location.lng();

		console.log('url will be ' + url);

        return url;
    }



	/**
	 * Request an audio stream to listen to
	 */
	function listen()
	{
        // if firsttime, call play() synchronously to satisfy iOS html audio rules
        // since RW stream is not yet instantiated initially, we need to load dummy
        // mp3 into audio player in order to play() and then quickly pause()
        if (firstplay) {
            console.log("playing manually first time");
            document.getElementById('streamplayer').play();
            document.getElementById('streamplayer').pause();
            // $('#play').prop('src', 'web-listener/images/pause.png');
            $("#play").contents().filter(function(){ return this.nodeType == 3; }).first().replaceWith("Pause");
            firstplay = false;
        }
        // otherwise proceed normally
        // make ajax call to see if mountpoint exists
        // if exists, simply play, if not create new stream and then play
        $.ajax( {
            url: options.url2 + 'streams/' + config.session.session_id + '/isactive/',
            type: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
            error: function(data) {
                logger.info("ERROR: Server not responding.");
            },
            success: function(data) {
                var streamplayer = document.getElementById('streamplayer');
                console.log('is stream active? ' + data.active);
                console.log('streamplayer.paused: ' + streamplayer.paused);

                if (!data.active) {
                    $("#play").contents().filter(function(){ return this.nodeType == 3; }).first().replaceWith("Pause");
                    request_stream2();
                    console.log("No stream available for current session; may have been killed due to inactivity. Generating new stream.");
                    return;
                }
                if (streamplayer.paused) {
                    console.log('playing');
                    streamplayer.play();
                    $("#play").contents().filter(function(){ return this.nodeType == 3; }).first().replaceWith("Pause");
                } else {
                    streamplayer.pause();
                    console.log('pausing!');
                    $("#play").contents().filter(function(){ return this.nodeType == 3; }).first().replaceWith("Play");
                }
            }
        });
	}

	/**
	 * sort tags by order
	 */
	function tag_sort(a, b)
	{
		return a.order > b.order ? 1 : a.order < b.order ? -1 : 0;
	}


	/**
	 * do some browser sniffing to determine the best listen button to show.
	 * Firefox is still DOA; iOS devices use native HTML5 controls, and everything else
	 * gets a JPlayer widget.
	 */
	function show_listening_button()
	{
        $('#play').click(function(event) {
            request_stream2();
        });

        main_callback();
	}



	/**
	 * list tags that may be used to filter the map points/update the stream.
	 */
	function show_filters()
	{
		var parsed_tags = parse_tags(tags);
		$('#filter-tags').append(parse_tags(tags)).show();

		var checkboxLabels = $("input[type='checkbox']").parent('label');
		checkboxLabels.css({backgroundColor: '#ffffff'});

		main_callback();
	}



	/**
	 * Given a list of tags as from a get_tags request, transform the list into an HTML
	 * string and return it.
	 */
	function parse_tags(data)
	{
        var str = '';
        $.each(data, function(i, item) {
            if (item.select == 'single') {
            	str += '<div class="tag-category-title">' + item.name + '</div>';
                str += '<ul class="filtering-options fit">';
                str += show_single(item);
                str += '</ul>';
            }
            else if (item.select == 'multi') {
            	str += '<div class="tag-category-title">' + item.name + '</div>';
                str += '<ul class="filtering-options fit">';
                str += show_multi(item);
                str += '</ul>';
            }
            else if (item.select == 'multi_at_least_one') {
            	str += '<div class="tag-category-title">' + item.name + '</div>';
                str += '<ul class="filtering-options fit">';
                str += show_multi(item);
                str += '</ul>';
            }
            else if (item.select == 'one_or_all') {
            }
        });

        return str;
	}



	/**
     * Given a JSON object representing a select-one item, convert it to an HTML select item
     * and return it.
     *
     * @param field
     * @returns {String}
     */
    function show_single(field)
    {
        var str = '';
        var newString = "";
        $.each(field.options, function(i, item) {
            var selected = '';
            $.each(field.defaults, function(j, field_default) {
                if (field_default == item.tag_id) {
                    selected = 'selected';
                }

            });
            var splitString = item.value.split('|');
            if (splitString.length > 1) {
                newString = splitString[0] + ", " + splitString[1];
            } else {
                newString = splitString[0];
            }

            str += '<li><label for="tag-'+item.tag_id +'"><input type="radio" class="tag checked" name="' + field.code + '" id="tag-' + item.tag_id + '" value="'+ item.tag_id +'">' + newString + '</label></li>';

        });

        return str;

    }



    /**
     * Given a JSON object representing a select-multi item, convert it to a string of
     * HTML checkboxes and return it.
     *
     * @param field
     * @returns {String}
     */
    function show_multi(field)
    {
        var str = '';

        $.each(field.options, function(i, item) {
            var checked = '';

            $.each(field.defaults, function(j, field_default) {

                if (field_default == item.tag_id) {
                    checked = 'checked';
                }

            });

            var splitString = item.value.split('|');
            var newString = "";
            if (splitString.length > 1) {
                newString = splitString[0] + ", " + splitString[1];
            } else {
                newString = splitString[0];
            }

            str += '<li><input type="checkbox" name="' + item.shortcode;
            str += '" class="tag tag-selected" id="tag-' + item.tag_id;
            str += '" value="' + item.tag_id + '" data-text="' + item.value + '"' + checked;
            str += '><label class="tag button fit" for="tag-' + item.tag_id;
            str += '">' + newString + '</label></li>';
        });

        return str;

    }


    function show_spinner(duration) {
        $('#stream-spinner').fadeIn(500).delay(duration).fadeOut(500);
    }


	/**
	 * update the existing audio stream
	 */
	function modify_stream()
	{
		if (! is_listening) {
			listen();
			return;
		}
		$.ajax({
			url: get_url('move_listener'),
			dataType: 'json',
			success: function(data) {
				console.log('stream modified');
			},
			error: function(data) {
				console.log('stream modify failure');
			}
		});
	}

    /**
     * POST api/2/streams/
     */
    function request_stream2()
    {
        show_spinner(5000);
        var listener_location = listening_pin.getPosition();
        var tag_ids = $('input.tag:checked').map(function() {
              return this.value;
            }).get().join(',');
       var formData = new FormData();
       formData.append('latitude', listener_location.lat());
       formData.append('longitude', listener_location.lng());
       formData.append('session_id', config.session.session_id);

        $.ajax({
            url: options.url2 + 'streams/',
            data: formData,
            type: 'POST',
            processData: false,
            contentType: false,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
            error: function(data) {
                console.log("streams/ creation failed: "); console.log(data);
            },
            success: function(data) {
                console.log("stream created via api/2");
                console.log("New stream url: " + data.stream_url);

                mountpoint = data.stream_url;
                $("#audiosource").prop("src", mountpoint);
                $('#streamplayer').trigger('load');
                $('#streamplayer').trigger('play');

                is_listening = true;

                modify_stream();
            }
        });
    }

    /**
     * PATCH api/2/streams/
     */
    function modify_stream2(lr_max, lr_min)
    {
        show_spinner(5000);
        var listener_location = listening_pin.getPosition();
        var tag_ids = $('input.tag:checked').map(function() {
              return this.value;
            }).get().join(',');
        data = {'listener_range_max': lr_max,
                'listener_range_min': lr_min,
                'latitude'  : listener_location.lat(),
                'longitude' : listener_location.lng(),
                'tag_ids' : tag_ids
               }
        $.ajax({
            url: options.url2 + 'streams/' + config.session.session_id + '/',
            data: data,
            type: 'PATCH',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', roundwareAuthToken);
            },
            error: function(data) {
                console.log("streams/ modification failed: "); console.log(data);
            },
            success: function(data) {
                console.log("stream modified");
            }
        });
    }

	return this;

};
