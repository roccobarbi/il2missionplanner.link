const calc = require("./calc.js");
module.exports = (function() {

    const calc = require('./calc.js');

    function formatTime(timeInSeconds) {
        const minutes = timeInSeconds / 60;
        const seconds = timeInSeconds % 60;
        return Math.floor(minutes).toFixed(0) + ':' + calc.pad(seconds, 2);
    }

    function isAvailableMapHash(hash, maps) {
        for (let map in maps) {
            if (maps[map].hash === hash) {
                return true;
            }
        }
        return false;
    }

    function getSelectedMapConfig(hash, maps) {
        for (let map in maps) {
            if (maps[map].hash === hash) {
                return maps[map];
            }
        }
        return maps.stalingrad;
    }

    function defaultSpeedArray(speed, count) {
        const speedArray = [];
        for (let i = 0; i < count; i++) {
            speedArray.push(speed);
        }
        return speedArray;
    }

    function formatFlightLegMarker(distance, heading, speed, time) { // jshint ignore:line
        distance = typeof distance === 'number' ? distance.toFixed(1) : distance;
        heading = typeof heading === 'number' ? heading.toFixed(0) : heading;
        return '[' + distance + 'km|' + calc.pad(heading, 3) + '&deg;/' + calc.pad(calc.invertHeading(heading), 3) +'&deg;|' + speed + 'kph|' + time + ']';
    }

    function isLine(layer) {
        return typeof layer.getLatLngs !== 'undefined';
    }

    function isMarker(layer) {
        return typeof layer.getLatLng !== 'undefined';
    }

    function buildGetXhr(url, updateFn) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = updateFn;
        xhr.send(null);
        return xhr;
    }

    function buildSyncGetXhr(url) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        return xhr;
    }

    // Class functions taken from here: http://jaketrent.com/post/addremove-classes-raw-javascript/
    function hasClass(el, className) {
        if (el.classList) {
            return el.classList.contains(className);
        } else {
            return !!el.className.match(new RegExp('(\\s|^)' + className + '(\\s|$)'));
        }
    }

    function addClass(el, className) {
        if (el.classList) {
            el.classList.add(className);
        } else if (!this.hasClass(el, className)) {
            el.className += " " + className;
        }
    }

    function removeClass(el, className) {
        if (el.classList) {
            el.classList.remove(className);
        } else if (this.hasClass(el, className)) {
            const reg = new RegExp('(\\s|^)' + className + '(\\s|$)');
            el.className=el.className.replace(reg, ' ');
        }
    }
    // End class functions

    // Download function taken from here https://stackoverflow.com/questions/2897619/using-html5-javascript-to-generate-and-save-a-file
    function download(filename, text) {
        const pom = document.createElement('a');
        pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
        pom.setAttribute('download', filename);

        if (document.createEvent) {
            const event = document.createEvent('MouseEvents');
            event.initEvent('click', true, true);
            pom.dispatchEvent(event);
        }
        else {
            pom.click();
        }
    }
    // End download function

    /**
     * Stores the map state (including all markers and waypoints) to a JavaScript object.
     * @param drawnItems
     * @returns {{routes: *[], mapHash, points: *[]}}
     */
    function exportMapState(drawnItems) {
        const saveData = {
            mapHash: window.location.hash,
            routes: [],
            points: []
        };
        drawnItems.eachLayer(function(layer) {
            const saveLayer = {};
            if (isLine(layer)) {
                saveLayer.latLngs = layer.getLatLngs();
                saveLayer.name = layer.name;
                saveLayer.speed = layer.speed;
                saveLayer.speeds = layer.speeds;
                saveData.routes.push(saveLayer);
            } else if (isMarker(layer)) {
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

    return {
        formatTime: formatTime,
        isAvailableMapHash: isAvailableMapHash,
        getSelectedMapConfig: getSelectedMapConfig,
        defaultSpeedArray: defaultSpeedArray,
        formatFlightLegMarker: formatFlightLegMarker,
        isLine: isLine,
        isMarker: isMarker,
        buildGetXhr: buildGetXhr,
        buildSyncGetXhr: buildSyncGetXhr,
        hasClass: hasClass,
        addClass: addClass,
        removeClass: removeClass,
        download: download,
        exportMapState: exportMapState
    };
})();
