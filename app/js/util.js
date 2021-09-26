module.exports = (function() {

    const calc = require('./calc.js');

    return {

        formatTime: function(timeInSeconds) {
            const minutes = timeInSeconds / 60;
            const seconds = timeInSeconds % 60;
            return Math.floor(minutes).toFixed(0) + ':' + calc.pad(seconds, 2);
        },

        isAvailableMapHash: function(hash, maps) {
            for (let map in maps) {
                if (maps[map].hash === hash) {
                    return true;
                }
            }
            return false;
        },

        getSelectedMapConfig: function(hash, maps) {
            for (let map in maps) {
                if (maps[map].hash === hash) {
                    return maps[map];
                }
            }
            return maps.stalingrad;
        },

        defaultSpeedArray: function(speed, count) {
            const speedArray = [];
            for (let i = 0; i < count; i++) {
                speedArray.push(speed);
            }
            return speedArray;
        },

        formatFlightLegMarker: function(distance, heading, speed, time) { // jshint ignore:line
            distance = typeof distance === 'number' ? distance.toFixed(1) : distance;
            heading = typeof heading === 'number' ? heading.toFixed(0) : heading;
            return '[' + distance + 'km|' + calc.pad(heading, 3) + '&deg;/' + calc.pad(calc.invertHeading(heading), 3) +'&deg;|' + speed + 'kph|' + time + ']';
        },

        isLine: function(layer) {
            return typeof layer.getLatLngs !== 'undefined';
        },

        isMarker: function(layer) {
            return typeof layer.getLatLng !== 'undefined';
        },

        buildGetXhr: function(url, updateFn) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onreadystatechange = updateFn;
            xhr.send(null);
            return xhr;
        },

        buildSyncGetXhr: function(url) {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send(null);
            return xhr;
        },

        // Class functions taken from here: http://jaketrent.com/post/addremove-classes-raw-javascript/
        hasClass: function(el, className) {
            if (el.classList) {
                return el.classList.contains(className);
            } else {
                return !!el.className.match(new RegExp('(\\s|^)' + className + '(\\s|$)'));
            }
        },

        addClass: function(el, className) {
            if (el.classList) {
                el.classList.add(className);
            } else if (!this.hasClass(el, className)) {
                el.className += " " + className;
            }
        },

        removeClass: function(el, className) {
            if (el.classList) {
                el.classList.remove(className);
            } else if (this.hasClass(el, className)) {
                const reg = new RegExp('(\\s|^)' + className + '(\\s|$)');
                el.className=el.className.replace(reg, ' ');
            }
        },
        // End class functions

        // Download function taken from here https://stackoverflow.com/questions/2897619/using-html5-javascript-to-generate-and-save-a-file
        download: function(filename, text) {
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

    };
})();
