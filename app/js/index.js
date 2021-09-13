(function() {

    'use strict';

    var fs = require('fs');
    var content = require('./content.js');
    var calc = require('./calc.js');
    var util = require('./util.js');
    var icons = require('./icons.js')(L); // The L object is created by Leaflet
    var webdis = require('./webdis.js');
    require('./controls.js');

    var conf = JSON.parse(fs.readFileSync('dist/conf.json', 'utf8')); // The path probably reflects how the application is packaged by npm

    const
        RED = '#9A070B',
        RED_FRONT = '#BD0101',
        BLUE_FRONT = '#4D4B40',
        FLIGHT_OPACITY = 0.8,
        LINE_OPTIONS = {
            color: RED,
            weight: 2,
            opacity: FLIGHT_OPACITY

        }
    ;

    var map, mapTiles, mapConfig, drawnItems, hiddenLayers, frontline,
            drawControl, selectedMapIndex;

    /*
    * Application state
    *
    * state.changing and state.connected are checked through this file to enable or disable features
    *
    * state.connect is set true:
    * - by the stream-connect button, if the connection is successful
    *
    * state.connected is set false:
    * - by the disconnect button
    *
    * state.changing is set true:
    * - on the editstart event
    * - on the deletestart event
    *
    * state.changing is set false:
    * - on the editstop event
    * - on the deletestop event
    * */
    var state = {
        colorsInverted: false,
        showBackground: true,
        streaming: false,
        connected: false,
        changing: false,
        streamInfo: {}
    };

    // Patch leaflet content with custom language
    L.drawLocal = content.augmentedLeafletDrawLocal;

    // Initialize form validation
    var V = new Validatinator(content.validatinatorConfig);

    /**
     * True if the map is empty.
     *
     * @returns {boolean}
     */
    function mapIsEmpty() {
      return drawnItems.getLayers().length === 0 && frontline.getLayers().length === 0;
    }

    /**
     * newFlightDecorator draws a route on the map.
     *
     * The route can be expressed as:
     * - L.Polyline
     * - L.Polygon
     * - an array of L.LatLng, or with Leaflet's simplified syntax, an array of 2-cells arrays of coordinates (useful if
     *   you just want to draw patterns following coordinates, but not the line itself)
     * - an array of any of these previous types, to apply the same patterns to multiple lines
     *
     * Dependency: https://github.com/bbecquet/Leaflet.PolylineDecorator
     *
     * @param route the route to be drawn on the map
     * @returns {*}
     */
    function newFlightDecorator(route) {
        return L.polylineDecorator(route, {
            patterns: [
                {
                    offset: 6,
                    repeat: 300,
                    symbol: L.Symbol.arrowHead({
                        pathOptions: {
                            opacity: 0,
                            fillOpacity: FLIGHT_OPACITY,
                            color: RED
                        }
                    })
                }
            ]
        });
    }

    /**
     * Given a new flight leg marker, calculate the new flight leg and draw it on the map.
     *
     * @param marker
     */
    function applyCustomFlightLeg(marker) {
        if (state.changing || state.connected) {
            return; // Do nothing if the map is changing, or if the user is connected to a stream
        }
        var parentRoute = drawnItems.getLayer(marker.parentId);
        map.openModal({
            speed: parentRoute.speeds[marker.index],
            template: content.flightLegModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('flight-leg-speed');
                element.focus();
                element.select();
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    if (V.passes('flight-leg-form')) {
                        var newSpeed = parseInt(element.value);
                        parentRoute.speeds[marker.index] = newSpeed;
                        marker.options.speed = newSpeed;
                        applyCustomFlightLegCallback(marker);
                        e.modal.hide();
                    } else {
                        var errorElement = document.getElementById('flight-leg-error');
                        errorElement.innerHTML = 'Please input a valid speed in kilometers per hour.';
                        util.removeClass(errorElement, 'hidden-section');
                        errorElement.focus();
                    }
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            }
        });
    }

    /**
     * When a new flight leg is added, calculate the flight time based on speed and distance and use this information,
     * together with the heading, to draw the flight leg on the map.
     * @param marker
     */
    function applyCustomFlightLegCallback(marker) {
        marker.options.time = util.formatTime(calc.time(marker.options.speed, marker.options.distance));
        var newContent = util.formatFlightLegMarker(
                marker.options.distance, marker.options.heading, marker.options.speed, marker.options.time);
        marker.setIcon(icons.textIconFactory(newContent, 'flight-leg ' + getMapTextClasses(state)));
        publishMapState();
    }

    /**
     * Calculate distances, headings, etc. for a new flight plan and apply it to the map.
     *
     * @param route
     * @param newFlight
     */
    function applyFlightPlanCallback(route, newFlight) {
        function routeClickHandlerFactory(clickedRoute) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                deleteAssociatedLayers(L.layerGroup([clickedRoute]));
                applyFlightPlan(clickedRoute);
            };
        }
        function markerClickHandlerFactory(clickedMarker) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                applyCustomFlightLeg(clickedMarker);
            };
        }
        if (newFlight) {
            route.on('click', routeClickHandlerFactory(route));
        }
        var id = route._leaflet_id;
        var coords = route.getLatLngs();
        var decorator = newFlightDecorator(route);
        decorator.parentId = id;
        decorator.addTo(map);
        if (typeof route.speeds === 'undefined' || route.speedDirty || route.wasEdited) {
            route.speeds = util.defaultSpeedArray(route.speed, coords.length-1);
        }
        for (var i = 0; i < coords.length-1; i++) { // TODO: good candidate to extract a function
            var distance = mapConfig.scale * calc.distance(coords[i], coords[i+1]);
            var heading = calc.heading(coords[i], coords[i+1]);
            var midpoint = calc.midpoint(coords[i], coords[i+1]);
            var time = util.formatTime(calc.time(route.speeds[i], distance));
            var markerContent = util.formatFlightLegMarker(distance, heading, route.speeds[i], time);
            var marker =  L.marker(midpoint, {
                distance: distance,
                heading: heading,
                time: time,
                speed: route.speeds[i],
                icon: icons.textIconFactory(markerContent, 'flight-leg ' + getMapTextClasses(state))
            });
            marker.parentId = id;
            marker.index = i;
            marker.on('click', markerClickHandlerFactory(marker));
            marker.addTo(map);
        }
        var endMarker = L.circleMarker(coords[coords.length-1], { // TODO: good candidate to extract a function
            interactive: false,
            radius: 3,
            color: RED,
            fillColor: RED,
            opacity: FLIGHT_OPACITY,
            fillOpacity: FLIGHT_OPACITY
        });
        endMarker.parentId = id;
        endMarker.addTo(map);
        var nameCoords = L.latLng(coords[0].lat, coords[0].lng);
        var nameMarker = L.marker(nameCoords, {
            draggable: false,
            icon: icons.textIconFactory(route.name, 'map-title flight-titles ' + getMapTextClasses(state))
        });
        nameMarker.parentId = id;
        nameMarker.on('click', routeClickHandlerFactory(route));
        nameMarker.addTo(map);
        publishMapState();
    }

    /**
     * Manage the user actions that enter a new flight plan.
     *
     * @param route
     */
    function applyFlightPlan(route) {
        if (state.changing || state.connected) {
            return;
        }
        var newFlight = false;
        if (typeof route.speed === 'undefined') {
            route.speed = content.default.flightSpeed;
            newFlight = true;
        }
        if (typeof route.name === 'undefined') {
            route.name = content.default.flightName;
        }
        var initialSpeed = route.speed;
        var clickedOk = false;
        map.openModal({
            speed: route.speed,
            name: route.name,
            template: content.flightModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('flight-name');
                element.focus();
                element.select();
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    clickedOk = true;
                    e.modal.hide();
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            },
            onHide: function(e) {
                if (clickedOk) {
                    route.name = document.getElementById('flight-name').value;
                    route.speed = parseInt(document.getElementById('flight-speed').value);
                    route.speedDirty = (route.speed !== initialSpeed);
                    applyFlightPlanCallback(route, newFlight);
                } else if (newFlight) {
                    drawnItems.removeLayer(route);
                } else {
                    applyFlightPlanCallback(route, newFlight);
                }
                checkButtonsDisabled();
            }
        });
    }

    /**
     * Applies a target to the map.
     *
     * @param target
     * @param newTarget
     */
    function applyTargetInfoCallback(target, newTarget) {
        function targetClickHandlerFactory(clickedTarget) {
            return function() {
                if (state.changing || state.connected) {
                    return;
                }
                deleteAssociatedLayers(L.layerGroup([clickedTarget]));
                applyTargetInfo(clickedTarget);
            };
        }
        var id = target._leaflet_id;
        var coords = target.getLatLng();
        target.setIcon(icons.factory(target.type, target.color));
        if (newTarget) {
            target.on('click', targetClickHandlerFactory(target));
        }
        var nameCoords = L.latLng(coords.lat, coords.lng);
        var nameMarker = L.marker(nameCoords, {
            draggable: false,
            icon: icons.textIconFactory(target.name, 'map-title target-title ' + getMapTextClasses(state))
        });
        nameMarker.parentId = id;
        nameMarker.on('click', targetClickHandlerFactory(target));
        nameMarker.addTo(map);
        if (target.notes !== '') {
            target.bindTooltip(target.notes, {
                direction: 'left'
            }).addTo(map);
        }
        publishMapState();
    }

    /**
     * Manage the user actions that enter a new target.
     *
     * @param target
     */
    function applyTargetInfo(target) {
        if (state.changing || state.connected) {
            return;
        }
        var newTarget = false;
        if (typeof target.name === 'undefined') {
            target.name = content.default.pointName;
            var newTarget = true;
        }
        if (typeof target.notes === 'undefined') {
            target.notes = '';
        }
        if (typeof target.type === 'undefined') {
            target.type = content.default.pointType;
        }
        if (typeof target.color === 'undefined') {
            target.color = content.default.pointColor;
        }
        var clickedOk = false;
        map.openModal({
            name: target.name,
            notes: target.notes,
            template: content.pointModalTemplate,
            zIndex: 10000,
            onShow: function(e) {
                var element = document.getElementById('target-name');
                element.focus();
                element.select();
                var typeSelect = document.getElementById('point-type-select');
                typeSelect.value = target.type;
                var colorSelect = document.getElementById('point-color-select');
                colorSelect.value = target.color;
                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                    clickedOk = true;
                    e.modal.hide();
                });
                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                    e.modal.hide();
                });
            },
            onHide: function(e) {
                if (clickedOk) {
                    target.name = document.getElementById('target-name').value;
                    target.notes = document.getElementById('target-notes').value;
                    target.type = document.getElementById('point-type-select').value;
                    target.color = document.getElementById('point-color-select').value;
                    applyTargetInfoCallback(target, newTarget);
                } else if (newTarget) {
                    drawnItems.removeLayer(target);
                } else {
                    applyTargetInfoCallback(target, newTarget);
                }
                checkButtonsDisabled();
            }
        });
    }

    /**
     * Remove the child layers associated to a certain parent layer.
     *
     * @param parentLayers one or more parent layers
     */
    function deleteAssociatedLayers(parentLayers) {
        var toDelete = [];
        parentLayers.eachLayer(function(layer) {
            toDelete.push(layer._leaflet_id);
        });

        map.eachLayer(function(layer) {
            if (toDelete.indexOf(layer.parentId) !== -1) {
                map.removeLayer(layer);
            }
        });
        hiddenLayers.eachLayer(function(layer) {
            if (toDelete.indexOf(layer.parentId) !== -1) {
                hiddenLayers.removeLayer(layer);
            }
        });
    }

    /**
     * Move all child layers of a certain parent layer to another layer.
     *
     * @param from source layer
     * @param to destination layer
     */
    function transferChildLayers(from, to) {
        from.eachLayer(function(layer) {
            if (typeof layer.parentId !== 'undefined') {
                from.removeLayer(layer);
                to.addLayer(layer);
            }
        });
    }

    /**
     * Show the hidden layers on the map.
     */
    function showChildLayers() {
        transferChildLayers(hiddenLayers, map);
    }

    /**
     * Hide the layers from the map
     */
    function hideChildLayers() {
        transferChildLayers(map, hiddenLayers);
    }

    /**
     * Disable one or more buttons, identified by their id.
     *
     * @param buttonList an array of one or more ids of buttons
     */
    function disableButtons(buttonList) {
        for (var i = 0; i < buttonList.length; i++) {
            var element = document.getElementById(buttonList[i]);
            element.classList.add('leaflet-disabled');
        }
    }

    /**
     * Enable one or more buttons, identified by their id.
     *
     * @param buttonList an array of one or more ids of buttons
     */
    function enableButtons(buttonList) {
        for (var i = 0; i < buttonList.length; i++) {
            var element = document.getElementById(buttonList[i]);
            element.classList.remove('leaflet-disabled');
        }
    }

    /**
     * Disable buttons if the map is empty, otherwise enable them.
     */
    function checkButtonsDisabled() {
        var buttons = ['export-button', 'missionhop-button'];
        if (!state.connected) { // TODO: understand the purpose of this check
            buttons.push('clear-button');
        }
        if (mapIsEmpty()) {
            disableButtons(buttons);
        } else {
            enableButtons(buttons);
        }
    }

    /**
     * Clear all layers.
     */
    function clearMap() {
        drawnItems.clearLayers();
        frontline.clearLayers();
        hideChildLayers();
        hiddenLayers.clearLayers();
        publishMapState();
    }

    /**
     * Stores the map state (including all markers and waypoints) to a JavaScript object.
     *
     * @returns {{routes: *[], mapHash: *, points: *[]}}
     */
    function exportMapState() {
        var saveData = {
            mapHash: window.location.hash,
            routes: [],
            points: []
        };
        drawnItems.eachLayer(function(layer) {
            var saveLayer = {};
            if (util.isLine(layer)) {
                saveLayer.latLngs = layer.getLatLngs();
                saveLayer.name = layer.name;
                saveLayer.speed = layer.speed;
                saveLayer.speeds = layer.speeds;
                saveData.routes.push(saveLayer);
            } else if (util.isMarker(layer)) {
                saveLayer.latLng = layer.getLatLng();
                saveLayer.name = layer.name;
                saveLayer.type = layer.type;
                saveLayer.color = layer.color;
                saveLayer.notes = layer.notes;
                saveData.points.push(saveLayer);
            }
        });
        return saveData;
    }

    /**
     * Select a map and display it (do nothing if it's already displayed).
     * @param selectedMapConfig
     */
    function selectMap(selectedMapConfig) {
        let newIndex = selectedMapConfig.selectIndex;
        if (newIndex !== selectedMapIndex) {
            selectedMapIndex = selectedMapConfig.selectIndex;
            window.location.hash = selectedMapConfig.hash;
            deleteAssociatedLayers(drawnItems);
            drawnItems.clearLayers();
            hiddenLayers.clearLayers();
            map.removeLayer(mapTiles);
            mapTiles = L.tileLayer(selectedMapConfig.tileUrl, {
                minZoom: selectedMapConfig.minZoom,
                maxZoom: selectedMapConfig.maxZoom,
                noWrap: true,
                tms: true
            }).addTo(map);
            map.setMaxBounds(calc.maxBounds(selectedMapConfig));
            map.setView(calc.center(selectedMapConfig), selectedMapConfig.defaultZoom);
        }
    }

    /**
     * Resize the map to fit all drawn items as well as possible into the viewport.
     */
    function fitViewToMission() {
        map.fitBounds(drawnItems.getBounds());
    }

    /**
     * Given a map state, it returns the class that should be used to display text on the map.
     * TODO: check if this process can be simplified directly via the UI. This feels like a magic number.
     *
     * @param state
     * @returns {string}
     */
    function getMapTextClasses(state) {
        var classes = 'map-text';
        if (state.colorsInverted) {
            classes += ' inverted';
        }
        if (!state.showBackground) {
            classes += ' nobg';
        }
        return classes;
    }

    /**
     * Given an object with a map's state (saved using the function exportMapState), import it and show it.
     *
     * This function is also used to embed maps for stats servers (retrieving the json with the saved map state from the
     * stat server itself).
     *
     * @param saveData
     */
    function importMapState(saveData) {
        clearMap();
        let importedMapConfig = util.getSelectedMapConfig(saveData.mapHash, content.maps);
        window.location.hash = importedMapConfig.hash;
        selectMap(importedMapConfig);
        mapConfig = importedMapConfig;
        selectedMapIndex = mapConfig.selectIndex;
        /*
        * Invert the latitude of each point in the frontline, so that it can be displayed correctly.
        *
        * frontline: [
        *   [[],[]],
        *   [[],[]]
        * ]*/
        let invertFrontlineLat = function(frontline){
            let invertedFrontLine = [];
            for (let count_frontlines = 0; count_frontlines < frontline.length; count_frontlines++) { // for each frontline
                invertedFrontLine.push([]);
                for (let blue_or_red = 0; blue_or_red < 2; blue_or_red++){
                    invertedFrontLine[count_frontlines].push([]);
                    for (let count_front_segments = 0; count_front_segments < frontline[count_frontlines][blue_or_red].length; count_front_segments++) {
                        invertedFrontLine[count_frontlines][blue_or_red].push([
                            mapConfig.latMax - frontline[count_frontlines][blue_or_red][count_front_segments][0],
                            frontline[count_frontlines][blue_or_red][count_front_segments][1]]);
                    }
                }
            }
            return invertedFrontLine;
        };
        if (saveData.routes) {
            for (let i = 0; i < saveData.routes.length; i++) {
                let route = [importedMapConfig.latMax - saveData.routes[i][0], saveData.routes[i][1]]; // latitide inverted
                let newRoute = L.polyline(route.latLngs, LINE_OPTIONS);
                newRoute.name = route.name;
                newRoute.speed = route.speed;
                newRoute.speeds = route.speeds;
                drawnItems.addLayer(newRoute);
                applyFlightPlanCallback(newRoute);
            }
        }
        if (saveData.points) {
            for (let i = 0; i < saveData.points.length; i++) {
                let point = saveData.points[i];
                let pointLatLng = {
                    "lat": importedMapConfig.latMax - point.latLng.lat, // latitude inverted
                    "lng": point.latLng.lng
                };
                let newPoint = L.marker(pointLatLng, {
                    icon: icons.factory(point.type, point.color)
                });
                newPoint.name = point.name;
                newPoint.type = point.type;
                newPoint.color = point.color;
                newPoint.notes = point.notes;
                drawnItems.addLayer(newPoint);
                applyTargetInfoCallback(newPoint);
            }
        }
        if (saveData.frontline) {
            let invertedFrontLine = invertFrontlineLat(saveData.frontline);
            for (let frontNdx = 0; frontNdx < saveData.frontline.length; frontNdx++) { // for each frontline
                let blueFront = invertedFrontLine[frontNdx][0];
                let redFront = invertedFrontLine[frontNdx][1];
                L.polyline(blueFront, {color: BLUE_FRONT, opacity: 1}).addTo(frontline);
                L.polyline(redFront, {color: RED_FRONT, opacity: 1}).addTo(frontline);
            }

        }
    }

    /**
     * If the user is streaming his map, publish the current state, so that anyone who subscribed to it can see it.
     */
    function publishMapState() {
        if (state.streaming) {
            var saveData = exportMapState();
            webdis.publish(state.streamInfo.name, state.streamInfo.password,
                    state.streamInfo.code, window.escape(JSON.stringify(saveData)));
        }
    }

    /**
     * Remove some controls to start working in connected mode.
     *
     * TODO: check why this is required.
     */
    function startConnectedMode() {
        map.removeControl(drawControl);
        map.removeControl(clearButton);
    }

    /**
     * Add some controls to stop working in connected mode.
     *
     * TODO: check why this is required.
     */
    function endConnectedMode() {
        map.removeControl(gridToolbar);
        map.removeControl(importExportToolbar);
        map.addControl(drawControl);
        map.addControl(gridToolbar);
        map.addControl(clearButton);
        map.addControl(importExportToolbar);
        checkButtonsDisabled();
    }

    /**
     * Set up a certain checkbox and element, so that if the checkbox is unchecked the element is hidden, and if the
     * checkbox is checked, the element is visible.
     * @param checkboxId
     * @param elementId
     */
    function setupCheckboxTogglableElement(checkboxId, elementId) {
        var checkbox = document.getElementById(checkboxId);
        var element = document.getElementById(elementId);
        L.DomEvent.on(checkbox, 'click', function() {
            if (checkbox.checked) {
                util.removeClass(element, 'hidden-section');

            } else {
                util.addClass(element, 'hidden-section');
            }
        });
    }

    /**
     * Set up the event listeners that manage events relative to map streaming.
     * If the page is not connected to a streaming server, the callbacks return without doing nothing, so that they
     * don't break any other functionality.
     */
    function setupStreamingEventListeners() {
        /*
        * Manage the il2:streamerror DOM event
        */
        window.addEventListener('il2:streamerror', function (e) {
            if (!state.connected) {
                return;
            }
            util.addClass(document.querySelector('a.fa-share-alt'), 'stream-error');
        });

        /*
        * Manage the il2:streamupdate DOM event
        */
        window.addEventListener('il2:streamupdate', function (e) {
            if (!state.connected) {
                return;
            }
            var saveData = e.detail;
            if (saveData !== 1) {
                clearMap();
                importMapState(JSON.parse(saveData));
            }
            util.removeClass(document.querySelector('a.fa-share-alt'), 'stream-error');
            checkButtonsDisabled();
        });
    }

    /**
     * Read the hash (if present) and check if it identifies a valid map (either stored locally, or embedded from a
     * game server. If so, load it.
     */
    function loadMapFromHash() {
        /*
        * This functionality allows external servers to store and embed maps.
        * These maps are accessible via a fragment identifier in the url.
        * */
        if (window.location.hash !== '' && !util.isAvailableMapHash(window.location.hash, content.maps)) {
            let responseBody = null;
            /*var url = conf.apiUrl + '/servers/' + window.location.hash.substr(1);*/
            let url = '';
            switch (window.location.hash) {
                case '#virtualpilots':
                    url = 'https://hw4bdhqxg9.execute-api.eu-south-1.amazonaws.com/getStoredMap?map=virtualpilots';
                    break;
                default:
                    url = '';
            }
            if (url !== '') {
                let xhr = util.buildGetXhr(url, function () { // TODO: get the file in a better way
                    if (xhr.readyState === 4) {
                        responseBody = JSON.parse(xhr.responseText);
                        importMapState(responseBody);
                        fitViewToMission();
                        checkButtonsDisabled();
                    }
                });
            }
        }
    }

    /**
     * Loads the map that is currently set in the hash map (loadMapFromHash should guarantee a locally stored map,
     * unless the user loaded a wrong map state).
     */
    function loadAndDrawMap() {
        /*
        * The map configuration is a JSON object that describes each map. All map configurations can be found in content.js,
        * in the mapConfigs variable.
        * selectIndex is an integer index, unique to each map, starting from 1 for the stalingrad map.
        */
        mapConfig = util.getSelectedMapConfig(window.location.hash, content.maps);
        selectedMapIndex = mapConfig.selectIndex;

        let zoomCoefficient = Math.pow(2, mapConfig.maxZoom - mapConfig.minZoom);
        L.CRS.MySimple = L.extend({}, L.CRS.Simple, {
            //                      coefficients: a      b    c     d
            transformation: new L.Transformation(1 / zoomCoefficient, 0, 1 / zoomCoefficient, 0) // Compute a and c coefficients so that tile 0/0/0 is from [0, 0] to [img]
        });

        /*
         * Reference: https://leafletjs.com/reference-1.7.1.html#map-example
         *
         * L.CRS.Simple is "a simple Coordinate Reference System that maps longitude and latitude into x and y directly".
         */
        map = L.map('map', {
            crs: L.CRS.MySimple,
            attributionControl: false
            //maxBounds: [0, 0, mapConfig.latMax, mapConfig.lngMax],
            //minZoom: mapConfig.minZoom,
            //maxZoom: mapConfig.maxZoom,
            //bounds: [0, 0, mapConfig.latMax, mapConfig.lngMax]
        });

        /*
        * Reference: https://leafletjs.com/reference-1.7.1.html#tilelayer
        *
        * tms, if true, inverses Y axis numbering for tiles. Since it is true, here is the wikipedia definition of TMS:
        * https://en.wikipedia.org/wiki/Tile_Map_Service
        *
        * The code probably needs to be updated. In the current version of leaflet, the noWrap property can only be found in
        * the gridLayer object. There is also no reference to the continuousWorld property.
        * TODO: update this code to the current version of leaflet.
        */
        mapTiles = L.tileLayer(mapConfig.tileUrl, {
            minZoom: mapConfig.minZoom,
            maxZoom: mapConfig.maxZoom,
            //bounds: [[0, 0], [mapConfig.latMax, mapConfig.lngMax]],
            noWrap: true,
            tms: true,
        }).addTo(map);

        /*
        * latMin and lngMin should always be set to zero in the map configuration, or calc.center won't work.
        * Everything else seems to be up to date with the current version of leaflet.
        */
        map.setView(calc.center(mapConfig), mapConfig.defaultZoom);
        map.setMaxBounds([[0, 0], [mapConfig.latMax, mapConfig.lngMax]]);
        //map.setMaxBounds(calc.maxBounds(mapConfig));

        /*
        * Set up a series of layer groups, so that layers can be easily managed later in the code.
        * This part seems to be up to date with the current version of leaflet.
        */
        drawnItems = L.featureGroup();
        map.addLayer(drawnItems);
        frontline = L.featureGroup();
        map.addLayer(frontline);
        hiddenLayers = L.featureGroup();
    }

    /**
     * Run the initial setup.
     */
    function setup() {
        loadMapFromHash();
        loadAndDrawMap();
    }

    setup();

    /*
    * Reference: https://leafletjs.com/examples/extending/extending-3-controls.html
    * Reference for L.Control.Draw: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html
    *
    * L.Control.TitleControl is defined in control.js
    * L.Control.CustomToolbar is defined in control.js
    * L.Control.Draw is an external library
    *
    * TODO: understand what was the purpose for the pice of code I commented out (which was throwing an error)
    */
    /*drawControl = new L.Control.Draw({
        draw: {
            polygon: false,
            rectangle: false,
            circle: false,
            polyline: {
                showLength: false,
                shapeOptions: LINE_OPTIONS
            },
            marker: {
                icon: icons.factory(content.default.pointType, content.default.pointColor)
            }
        },
        edit: {
            featureGroup: drawnItems,
            edit: L.Browser.touch ? false : {
                selectedPathOptions: {
                    maintainColor: true,
                    opacity: 0.4,
                    fill: false
                }
            }
        }
    });
    map.addControl(drawControl);*/

    var titleControl = new L.Control.TitleControl({});
    map.addControl(titleControl);

    var clearButton = new L.Control.CustomToolbar({
        position: 'bottomleft',
        buttons: [
            {
                id: 'clear-button',
                icon: 'fa-trash',
                tooltip: content.clearTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        map.openModal({
                            template: content.confirmClearModalTemplate,
                            onShow: function(e) {
                                var element = document.getElementById('confirm-cancel-button');
                                element.focus();
                                L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                    clearMap();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            },
                            onHide: function() {
                                checkButtonsDisabled();
                            }
                        });
                    }
                }
            }
        ]
    });
    map.addControl(clearButton);

    /*
    * Reference: https://leafletjs.com/examples/extending/extending-3-controls.html
    *
    * This specific toolbar component manages the map settings (e.g. which map has been selected) and the help.
    * Its UI is based on app/html/settingsModal.html and app/html/helpModal.html
    */
    var helpSettingsToolbar = new L.Control.CustomToolbar({
        position: 'bottomright',
        buttons: [
            {
                id: 'settings-button',
                icon: 'fa-gear',
                tooltip: content.settingsTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.settingsModalTemplate,
                        onShow: function(e) {
                            var mapSelect = document.getElementById('map-select');
                            mapSelect.selectedIndex = selectedMapIndex;
                            var originalIndex = selectedMapIndex;
                            var invertCheckbox = document.getElementById('invert-text-checkbox');
                            invertCheckbox.checked = state.colorsInverted;
                            var backgroundCheckbox = document.getElementById('text-background-checkbox');
                            backgroundCheckbox.checked = state.showBackground;
                            mapSelect.focus();
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                if (mapSelect.selectedIndex !== originalIndex) {
                                    var selectedMap = mapSelect.options[mapSelect.selectedIndex].value;
                                    mapConfig = content.maps[selectedMap];
                                    selectMap(mapConfig);
                                    selectedMapIndex = mapSelect.selectedIndex;
                                    publishMapState();
                                }
                                if (invertCheckbox.checked !== state.colorsInverted) {
                                    state.colorsInverted = invertCheckbox.checked;
                                    var textElements = document.getElementsByClassName('map-text');
                                    for (var i = 0; i < textElements.length; i++) {
                                        if (state.colorsInverted) {
                                            textElements[i].classList.add('inverted');
                                        } else {
                                            textElements[i].classList.remove('inverted');
                                        }
                                    }
                                }
                                if (backgroundCheckbox.checked !== state.showBackground) {
                                    state.showBackground = backgroundCheckbox.checked;
                                    var textElements = document.getElementsByClassName('map-text');
                                    for (var i = 0; i < textElements.length; i++) {
                                        if (state.showBackground) {
                                            textElements[i].classList.remove('nobg');
                                        } else {
                                            textElements[i].classList.add('nobg');
                                        }
                                    }
                                }
                                e.modal.hide();
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            },
            {
                id: 'help-button',
                icon: 'fa-question',
                tooltip: content.helpTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.helpModalTemplate,
                        onShow: function(e) {
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            }
        ]
    });
    map.addControl(helpSettingsToolbar);

    /*
    * Reference: https://leafletjs.com/examples/extending/extending-3-controls.html
    *
    * This specific toolbar component manages:
    * - the import and export features for maps;
    * - the stream feature.
    *
    * TODO: analyse how the streaming feature is managed in the frontend.
    * TODO: analyse how the streaming server works (or more likely, reengineer it).
    * TODO: rewrite component based on new streaming server
    */
    var importExportToolbar = new L.Control.CustomToolbar({
        position: 'bottomleft',
        buttons: [
            {
                id: 'import-button',
                icon: 'fa-upload',
                tooltip: content.importTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.importModalTemplate,
                        onShow: function(e) {
                            var importInput = document.getElementById('import-file');
                            importInput.focus();
                            var fileContent;
                            L.DomEvent.on(importInput, 'change', function(evt) {
                                var reader = new window.FileReader();
                                reader.onload = function(evt) {
                                    if(evt.target.readyState !== 2) {
                                        return;
                                    }
                                    if(evt.target.error) {
                                        window.alert('Error while reading file');
                                        return;
                                    }
                                    fileContent = evt.target.result;
                                };
                                reader.readAsText(evt.target.files[0]);
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                var saveData = JSON.parse(fileContent);
                                importMapState(saveData);
                                e.modal.hide();
                                fitViewToMission();
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        },
                        onHide: function() {
                            checkButtonsDisabled();
                        }
                    });
                }
            },
            {
                id: 'export-button',
                icon: 'fa-download',
                tooltip: content.exportTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        util.download('plan.json', JSON.stringify(exportMapState()));
                    }
                }
            },
            {
                id: 'stream-button',
                icon: 'fa-share-alt',
                tooltip: content.streamTooltip,
                clickFn: function() {
                    var template;
                    if (!state.streaming && !state.connected) {
                        template = content.streamModalTemplate;
                        fireStreamModal();
                    } else if (state.streaming && !state.connected) {
                        template = content.alreadyStreamingModalTemplate;
                        fireAlreadyStreamingModal();
                    } else if (!state.streaming && state.connected) {
                        template = content.alreadyConnectedModalTemplate;
                        fireAlreadyConnectedModal();
                    }
                    function fireStreamModal() {
                        map.openModal({
                            template: template,
                            onShow: function(e) {
                                document.getElementById('stream-start-button').focus();
                                L.DomEvent.on(document.getElementById('stream-start-button'), 'click', function() {
                                    e.modal.hide();
                                    fireStartModal();
                                });
                                L.DomEvent.on(document.getElementById('stream-connect-button'), 'click', function() {
                                    e.modal.hide();
                                    fireConnectModal();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireStartModal() {
                        map.openModal({
                            template: content.startStreamModalTemplate,
                            onShow: function(e) {
                                document.getElementById('stream-start-confirm-button').focus();
                                L.DomEvent.on(document.getElementById('stream-start-confirm-button'), 'click', function() {
                                    var streamName = document.getElementById('stream-name').value;
                                    var streamPassword = document.getElementById('stream-password').value;
                                    var streamCode = document.getElementById('stream-leader-code').value;
                                    if (!streamName || !streamPassword || !streamCode) {
                                        var errorElement = document.getElementById('start-stream-error');
                                        errorElement.innerHTML = 'All fields are required. Try again.';
                                        util.removeClass(errorElement, 'hidden-section');
                                        return;
                                    }
                                    var mapState = window.escape(JSON.stringify(exportMapState()));
                                    var response = webdis.startStream(streamName, streamPassword, streamCode, mapState);
                                    if (response[0] !== 'SUCCESS')  {
                                        var errorElement = document.getElementById('start-stream-error');
                                        errorElement.innerHTML = response[1];
                                        util.removeClass(errorElement, 'hidden-section');
                                        return;
                                    }
                                    state.streaming = true;
                                    util.addClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                    state.streamInfo = {
                                        name: streamName,
                                        password: streamPassword,
                                        code: streamCode
                                    };
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireConnectModal() {
                        map.openModal({
                            template: content.connectStreamModalTemplate,
                            onShow: function(e) {
                                var streamSelect = document.getElementById('stream-select');
                                var streams = webdis.getStreamList();
                                streamSelect.options.length = 0;
                                for (var i=0; i < streams.length; i++) {
                                    streamSelect.options[i] = new Option(streams[i].substring(7), streams[i].substring(7));
                                }
                                setupCheckboxTogglableElement('leader-checkbox', 'leader-hidden');
                                document.getElementById('stream-connect-button').focus();
                                L.DomEvent.on(document.getElementById('stream-connect-button'), 'click', function() {
                                    var selectedStream = streamSelect.options[streamSelect.selectedIndex].value;
                                    var password = document.getElementById('stream-password').value;
                                    var code, response;
                                    var checkbox = document.getElementById('leader-checkbox');
                                    if (checkbox.checked) {
                                        if (V.fails('connect-form')) {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = 'Password and code are required to connect.';
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        code = document.getElementById('stream-code').value;
                                        response = webdis.getStreamReconnect(selectedStream, password, code);
                                        if (response[0] !== 'SUCCESS') {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = response[1];
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        state.streamInfo.code = code;
                                        clearMap();
                                        importMapState(JSON.parse(response[2]));
                                        state.streaming = true;
                                        util.addClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                    } else {
                                        if (V.fails('connect-form')) {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = 'Password is required to connect.';
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        response = webdis.getStreamInfo(selectedStream, password);
                                        if (response[0] !== 'SUCCESS') {
                                            var errorElement = document.getElementById('connect-stream-error');
                                            errorElement.innerHTML = response[1];
                                            util.removeClass(errorElement, 'hidden-section');
                                            return;
                                        }
                                        webdis.subscribe(response[1]);
                                        clearMap();
                                        importMapState(JSON.parse(response[2]));
                                        state.connected = response[1];
                                        util.addClass(document.querySelector('a.fa-share-alt'), 'connected');
                                        startConnectedMode();
                                    }
                                    state.streamInfo = {
                                        name: selectedStream,
                                        password: password,
                                        code: code
                                    };
                                    checkButtonsDisabled();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireAlreadyConnectedModal() {
                        map.openModal({
                            streamName: state.streamInfo.name,
                            template: content.alreadyConnectedModalTemplate,
                            onShow: function(e) {
                                document.getElementById('disconnect-button').focus();
                                L.DomEvent.on(document.getElementById('disconnect-button'), 'click', function() {
                                    webdis.unsubscribe(state.connected);
                                    state.connected = false;
                                    util.removeClass(document.querySelector('a.fa-share-alt'), 'connected');
                                    endConnectedMode();
                                    e.modal.hide();
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                    function fireAlreadyStreamingModal() {
                        map.openModal({
                            streamName: state.streamInfo.name,
                            streamPassword: state.streamInfo.password,
                            streamCode: state.streamInfo.code,
                            template: content.alreadyStreamingModalTemplate,
                            onShow: function(e) {
                                document.getElementById('stop-streaming-button').focus();
                                setupCheckboxTogglableElement('already-streaming-checkbox', 'already-streaming-hidden');
                                L.DomEvent.on(document.getElementById('stop-streaming-button'), 'click', function() {
                                    e.modal.hide();
                                    state.streaming = false;
                                    util.removeClass(document.querySelector('a.fa-share-alt'), 'streaming');
                                });
                                L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                    e.modal.hide();
                                });
                            }
                        });
                    }
                }
            }
        ]
    });
    map.addControl(importExportToolbar);

    /*
    * Reference: https://leafletjs.com/examples/extending/extending-3-controls.html
    *
    * This component lets the user jump to a specific grid reference on the map.
    *
    * The UI is based on: app/html/gridJumpModal.html
    */
    var gridToolbar = new L.Control.CustomToolbar({
        position: 'topleft',
        buttons: [
            {
                id: 'gridhop-button',
                icon: 'fa-th-large',
                tooltip: content.gridHopTooltip,
                clickFn: function() {
                    map.openModal({
                        template: content.gridJumpModalTemplate,
                        onShow: function(e) {
                            var gridElement = document.getElementById('grid-input');
                            gridElement.focus();
                            L.DomEvent.on(e.modal._container.querySelector('.modal-ok'), 'click', function() {
                                if (V.passes('grid-jump-form')) {
                                    var grid = gridElement.value;
                                    var viewLatLng = calc.gridLatLng(grid, mapConfig);
                                    map.setView(viewLatLng, mapConfig.gridHopZoom);
                                    e.modal.hide();
                                } else {
                                    var errorElement = document.getElementById('grid-jump-error');
                                    errorElement.innerHTML = 'Please input a valid four digit grid number.';
                                    util.removeClass(errorElement, 'hidden-section');
                                    errorElement.focus();
                                }
                            });
                            L.DomEvent.on(e.modal._container.querySelector('.modal-cancel'), 'click', function() {
                                e.modal.hide();
                            });
                        }
                    });
                }
            },
            {
                id: 'missionhop-button',
                icon: 'fa-crop',
                tooltip: content.missionHopTooltip,
                clickFn: function() {
                    if (!mapIsEmpty()) {
                        fitViewToMission();
                    }
                }
            }
        ]
    });
    map.addControl(gridToolbar);

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * When a new vector or marker is created, add the relevant layer to the map.
    */
    map.on('draw:created', function(e) {
        drawnItems.addLayer(e.layer);
        if (e.layerType === 'polyline') {
            applyFlightPlan(e.layer);
        } else if (e.layerType === 'marker') {
            applyTargetInfo(e.layer);
        }
        checkButtonsDisabled();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * When a new vector or marker is deleted, remove the relevant layer from the map.
    */
    map.on('draw:deleted', function(e) {
        deleteAssociatedLayers(e.layers);
        publishMapState();
        checkButtonsDisabled();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * When a new vector or marker is changed, apply changes on the map.
    */
    map.on('draw:edited', function(e) {
        deleteAssociatedLayers(e.layers);
        e.layers.eachLayer(function(layer) {
            if (util.isLine(layer)) {
                layer.wasEdited = (layer.getLatLngs().length-1 !== layer.speeds.length);
                applyFlightPlanCallback(layer);
            } else if (util.isMarker(layer)) {
                applyTargetInfoCallback(layer);
            }
        });
        publishMapState();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * Safely manage editing.
    */
    map.on('draw:editstart', function() {
        state.changing = true;
        hideChildLayers();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * Safely manage editing.
    */
    map.on('draw:editstop', function() {
        state.changing = false;
        showChildLayers();
        checkButtonsDisabled();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * Safely manage deleting.
    */
    map.on('draw:deletestart', function() {
        state.changing = true;
        hideChildLayers();
    });

    /*
    * Reference: https://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html#l-draw-event-event
    *
    * Safely manage deleting.
    */
    map.on('draw:deletestop', function() {
        state.changing = false;
        showChildLayers();
        checkButtonsDisabled();
    });

    /*
    * This function ensures that the event listeners required to properly manage map streaming are set up correctly.
    * If the app is not connected to a remote streaming server, the listener callbacks without doing nothing.
    * */
    setupStreamingEventListeners();

    checkButtonsDisabled();

})();
