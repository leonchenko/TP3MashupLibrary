/*globals require */
/*eslint max-len: 0, no-underscore-dangle: 0 */
tau.mashups
    .addDependency('jQuery')
    .addDependency('Underscore')
    .addDependency('libs/parseUri')
    .addDependency('tau/core/class')

    .addDependency('tau/configurator')

    .addDependency('tp3/mashups/popup')
    .addDependency('tau/storage/api.nocache')
    .addCSS('NestedBoards.css')
    .addMashup(function($, _, parseUri, Class, configurator, Popup, storeapi) {

        'use strict';

        var reg = configurator.getBusRegistry();

        var addBusListener = function(busName, eventName, listener) {

            reg.on('create', function(e, data) {

                var bus = data.bus;
                if (bus.name === busName) {
                    bus.on(eventName, listener);
                }
            });

            reg.on('destroy', function(e, data) {

                var bus = data.bus;
                if (bus.name === busName) {
                    bus.removeListener(eventName, listener);
                }
            });

            reg.getByName(busName).done(function(bus) {
                bus.on(eventName, listener);
            });
        };

        var nestedBoardsConfig = {
            userstory: [{
                type: 'bug',
                name: 'Bugs Board'
            }, {
                type: 'task',
                name: 'Tasks Board'
            }],

            feature: [{
                type: 'userstory',
                name: 'Stories Board'
            }],

            testplan: [{
                type: 'testplanrun',
                name: 'View Plan Runs'
            }],

            iteration: [{
                type: 'bug',
                name: 'Iteration Bugs'
            }, {
                type: 'userstory',
                name: 'Iteration Stories'
            }],

            release: [{
                type: 'bug',
                name: 'Release Bugs'
            }, {
                type: 'feature',
                name: 'Release Features'
            }, {
                type: 'userstory',
                name: 'Release Stories'
            }],

            teamiteration: [{
                type: 'bug',
                name: 'Bugs Board (TI)'
            }, {
                type: 'userstory',
                name: 'Stories Board (TI)'
            }]
        };

        var typesByParent = _.reduce(nestedBoardsConfig, function(res, v, k) {

            v.forEach(function(type) {
                res[type.type] = res[type.type] || [];
                res[type.type].push(k);
                return res;
            });

            return res;
        }, {});

        var Mashup = Class.extend({

            init: function() {

                var uri = parseUri(window.location.href);
                this.request = uri.queryKey;

                addBusListener('application board', 'configurator.ready', function(e, appConfigurator) {
                    configurator = appConfigurator;
                }.bind(this));

                if (this.request.isNestedBoard) {
                    $('body').addClass('fullscreen');
                    this.patchSlice();

                    addBusListener('board_plus', 'board.configuration.ready', function(e, boardConfig) {
                        this.updateConfiguration(boardConfig);
                    }.bind(this));
                } else {

                    addBusListener('board.clipboard', '$el.readyToLayout', function(e, $el) {
                        this.renderToolbar($el);
                    }.bind(this));

                }
            },

            renderToolbar: function($el) {

                var $toolbar = $el.find('.i-role-nestedboardstoolbar');

                if (!$toolbar.length) {
                    $toolbar = $('<div class="tau-inline-group-nestedboardstoolbar i-role-nestedboardstoolbar"></div>')
                        .appendTo($el.find('.tau-select-block'));
                }

                $toolbar.children().remove();

                var renderButton = this.renderButton.bind(this);

                _.forEach(nestedBoardsConfig, function(config, entityTypeName) {
                    var $cards = $el.find('.tau-card-v2_type_' + entityTypeName);
                    if ($cards.length) {
                        _.forEach(config, function(subEntityConfig) {
                            $toolbar.append(renderButton(entityTypeName, subEntityConfig));
                        });
                    }
                });
            },

            renderButton: function(entityTypeName, subEntityConfig) {
                return $('<button class="tau-btn ' + '">' + subEntityConfig.name + '</button>')
                    .on('click', this.handleButton.bind(this, entityTypeName, subEntityConfig.type));
            },

            handleButton: function(entityTypeName, type) {

                var activityPopup = new Popup();
                activityPopup.show();
                activityPopup.showLoading();
                var $container = activityPopup.$container;

                var clipboardManager = configurator.getClipboardManager();
                var acidStore = configurator.getAppStateStore();

                acidStore.get({
                    fields: ['acid']
                }).then(function(data) {

                    var acid = data.acid;

                    var cards = _.values(clipboardManager._cache);

                    var clipboardData = cards.reduce(function(res, item) {
                        res[item.data.type] = res[item.data.type] || [];
                        res[item.data.type].push(item.data.id);

                        return res;
                    }, {});

                    var url = configurator.getApplicationPath() + "/restui/board.aspx?" +
                        "isNestedBoard=1" +
                        "&acid=" + acid +
                        "&clipboardData=" + encodeURIComponent(JSON.stringify(clipboardData)) +
                        "&axisType=" + entityTypeName +
                        "&cellType=" + type;

                    var $frame = $('<iframe class="nestedboardsframe" src="' + url + '"></iframe>');

                    $frame.load(function() {
                        activityPopup.hideLoading();
                    });

                    $container.append($frame);
                    $container.css({
                        padding: 0
                    });
                });
            },

            updateConfiguration: function(boardConfig) {

                var clipboardData = JSON.parse(decodeURIComponent(this.request.clipboardData));
                var cellType = this.request.cellType;
                var axisType = this.request.axisType;

                var axisIds = [];
                var cellIds = [];

                _.forEach(clipboardData, function(ids, entityType) {

                    if (axisType === entityType) {
                        axisIds = axisIds.concat(ids);
                    }

                    // if in clipboard entities, which should be shown in cells on nested board, then
                    // we show no-specified axis and ask cards in cells by this ids
                    if (typesByParent[entityType] && typesByParent[entityType].indexOf(axisType) >= 0) {
                        axisIds = axisIds.concat(null);
                        cellIds = cellIds.concat(ids);
                    }
                });

                var cellFilter = '?' + _.compact(axisIds.map(function(v) {
                    if (v) {
                        return axisType + '.Id == ' + v;
                    }
                })).concat(cellIds.map(function(v) {
                    return 'Id == ' + v;
                })).join(' or ');

                var axisFilter = _.compact(axisIds.map(function(v) {
                    if (v) {
                        return 'Id == ' + v;
                    }
                })).join(' or ');

                if (axisIds.indexOf(null) >= 0) {
                    axisFilter += ' or Id is None';
                } else {
                    axisFilter = '(' + axisFilter + ') and It is not None';
                }
                axisFilter = '?' + axisFilter;

                delete boardConfig.focus;
                delete boardConfig.selectedMarks;

                boardConfig.cells = {
                    filter: cellFilter,
                    types: [cellType]
                };

                boardConfig.x = {
                    types: ['entitystate']
                };

                boardConfig.y = {
                    filter: axisFilter,
                    types: [axisType]
                };
            },

            patchSlice: function() {

                var cellType = this.request.cellType;
                var axisType = this.request.axisType;

                var prevFn = storeapi.prototype._makeServiceCall;

                storeapi.prototype._makeServiceCall = function(ajaxConfig) {

                    if (ajaxConfig.url.match(/api\/board\/v1\//) && ajaxConfig.type.toLowerCase() === 'post') {
                        var matched = ajaxConfig.url.match(/\/(\d+)/);
                        if (matched) {
                            var boardId = ajaxConfig.url.match(/\/(\d+)/)[1];
                            ajaxConfig.url = configurator.getApplicationPath() + '/storage/v1/boards_private_' + axisType + "_" + cellType + '_boardlink/' + boardId;
                        }
                    }
                    return prevFn.apply(this, arguments);
                };
            }

        });

        return new Mashup();

    });
