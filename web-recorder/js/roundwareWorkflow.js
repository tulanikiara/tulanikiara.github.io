if (! window.RoundWare) {
    window.RoundWare = {};
}

RoundWare.Workflow = function(project_id) {

    var steps = [stepTags, stepRecorder];
    var step = undefined;

    // value for the "Authorization: " HTTP header
    var authorization = 'Token 7da50488030ecdf43020d611687e2390c5f4e542';
    var url = 'https://prod.roundware.com/api/2/';
    var config = {
        project_id : 29,
        client_system : navigator.userAgent,
    }

    var project = {};
    var session = {};
    var categories = {};
    var speak_counter = 0;

    var marker = undefined;

    initialize(project_id);

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

    // truncate client_system as on mobile browsers, it is longer than the server wants
    if (config.client_system.length >= 128) {
        var str = config.client_system.slice(0,20);
        config.client_system = str;
        logger.info('client_system short = ' + config.client_system);
    }

    function stepTags()
    {
        var valid_tags = false;
        $.ajax({
            url: url + 'projects/' + config.project_id + '/uigroups/',
            data: {"session_id": session.id},
            type: 'GET',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', authorization);
            },
            success: function(data) {
                if (! project.tags) {
                    project.ui_groups = data;
                }

                $.ajax({
                    url: url + 'projects/' + config.project_id + '/tags/',
                    data: {"session_id": session.id},
                    type: 'GET',
                    beforeSend: function(xhr) {
                        xhr.setRequestHeader('Authorization', authorization);
                    },
                    success: function(data) {
                        project.tags = data
                        console.log(project.ui_groups);

                        var str = "";
                        var str_question = "";
                        $.each(project.ui_groups, function(i, group) {
                            console.log(group);
                            if ("speak" == group.ui_mode && group.tag_category_id != 2) { // tag category 2 is 'question'
                                speak_counter++;
                                // str += '<div class="tag-category-title">' + group.name + '</div>';
                                str += "<ul class='filtering-options fit'>";
                                $.each(group.ui_items, function(i, item) {
                                    $.each(project.tags, function(i, tag) {
                                        if (item.tag_id == tag.id && item.active) {
                                            str += "<li class=''><input type='radio' name='group-"+ group.id;
                                            str += "' class='tag' value='" + tag.id + "' id='tag-" + tag.id;
                                            str += "' data-text='" + tag.msg_loc + "' uiitem='" + item.id;
                                            str +="'><label class='tag button fit' for='tag-"+ tag.id + "'>" + tag.msg_loc;
                                            str += "</label></li>";
                                        }
                                    });
                                });
                                str += "</ul>";
                            }
                            else if ("speak" == group.ui_mode && group.tag_category_id == 2) { // tag category 2 is 'question'
                                // speak_counter++;
                                // str += '<div class="tag-category-title">' + group.name + '</div>';
                                str_question += "<ul class='filtering-options fit'>";
                                $.each(group.ui_items, function(i, item) {
                                    $.each(project.tags, function(i, tag) {
                                        if (item.tag_id == tag.id && item.active) {
                                            str_question += "<li class=''><input type='radio' name='group-"+ group.id;
                                            str_question +="' class='tag' value='" + tag.id + "' id='tag-" + tag.id;
                                            str_question += "' data-text='" + tag.msg_loc + "' parent-uiitem='" + item.parent_id;
                                            str_question += "'><label class='tag button fit' for='tag-"+ tag.id + "'>" + tag.msg_loc;
                                            str_question += "</label></li>";
                                        }
                                    });
                                });
                                str_question += "</ul>";
                            }
                        });
                        $('#step-tags').prepend(str);
                        $('#step-question-tags').prepend(str_question);

                        $('input.tag').click(function(event) {
                            $(this).toggleClass('tag-selected');
                            // $('#feeling').text($(this).attr('data-text'));
                            console.log("new tag selected: " + $(this).attr('data-text'));
                        });

                        $('#step-tags input').click(function(event) {
                            var selected_uiitem = $(this).attr('uiitem');
                            $.each($('#step-question-tags input'), function(i, tag) {
                                // loop through all uiitem input and remove ones that don't have proper parent uiitem
                                // console.log("looping: " + $(tag).attr('parent-uiitem'));
                                if ($(tag).attr('parent-uiitem') != selected_uiitem &&
                                    $(tag).attr('parent-uiitem') != 'null') {
                                        $(tag).parent().css( "display", "none" );
                                }
                                else {
                                    $(tag).parent().css( "display", "inherit" );
                                }
                            });
                            console.log("new uiitem selected: " + $(this).attr('uiitem'));
                        });

                        $('input.tag').change(function() {
                            if (! valid_tags && $('input:checked').length == speak_counter && marker) {
                                valid_tags = true;
                                $('#tags-next-wrapper').fadeIn('300');
                                logger.info("fade in tags-next-wrapper");
                                $('#tags-next').on('click', function() {
                                    var legal = project.legal_agreement;
                                    var legal_popup = legal.replace(/\r\n/g, "<br>");
                                    logger.info("legal: " + legal_popup);
                                    alertify
                                        .okBtn("Agree")
                                        .cancelBtn("Deny")
                                        .confirm(legal_popup, function () {
                                            document.body.scrollTop = document.documentElement.scrollTop = 0;
                                            stepRecorder();
                                    }, function() {
                                        // user clicked "cancel"
                                    });
                                });
                                $('#rec-prev').on('click', function() {
                                    $('#step-1').fadeIn('300');
                                    $('#step-2').fadeOut('300');
                                    // (steps.shift())();
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    function stepLegal()
    {
        $('#step-legal').fadeIn('300');
        $('#legal-next').click(function() {
            $('#step-legal').fadeOut('300');
            (steps.shift())();
        });
    }

    function stepRecorder()
    {
        (new RoundWare.Recorder()).initializeSession(session, project)
        $('#step-1').fadeOut('300');
        $('#step-2').fadeIn('300');
        // $('#step-recorder').fadeIn('300');
    }

    /**
     * Get a session, then use that to get additional project data, and
     * finally to work through the steps.
     */
    function initialize(project_id)
    {
        config.project_id = project_id;
        var formData = new FormData();
        formData.append('project_id', config.project_id);
        formData.append('client_system', config.client_system);

        $.ajax({
            url: url + 'sessions/',
            data: formData,
            processData: false,
            type: 'POST',
            contentType: false,
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', authorization);
            },
            success: function(data) {
                session = data;

                $.ajax({
                    url: url + 'projects/' + config.project_id + '/',
                    data: {"session_id": session.id},
                    type: 'GET',
                    beforeSend: function(xhr) {
                        xhr.setRequestHeader('Authorization', authorization);
                    },
                    success: function(data) {
                        project = data;
                        (steps.shift())();
                    }
                });
            }
        });
    }

    this.setMarker = function(m) {
        marker = m;
    }
};
