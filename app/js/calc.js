/*
Several utility functions to calculate values such as:
- the flight time based on speed and distance (time);
- the heading between two points (heading, geometricDegreesToGeographic);
- the distance between two points on the map (distance).
 */
module.exports = (function() {

    const
        SECONDS_IN_HOUR = 3600,
        BORDER = 5
    ;

    return {

        distance: function(a, b) {
            const dLng = b.lng - a.lng;
            const dLat = b.lat - a.lat;
            return Math.sqrt(dLng * dLng + dLat * dLat);
        },

        geometricDegreesToGeographic: function(degrees) {
            if (degrees < 0) {
                degrees += 360;
            }
            return (450 - degrees) % 360;
        },

        heading: function(a, b) {
            const radians = Math.atan2(b.lat - a.lat, b.lng - a.lng);
            let degrees = radians * 180 / Math.PI;
            degrees = this.geometricDegreesToGeographic(degrees);
            return degrees;
        },

        midpoint: function(a, b) {
            const lat = (a.lat + b.lat) / 2;
            const lng = (a.lng + b.lng) / 2;
            return L.latLng(lat, lng);
        },

        pad: function(num, size) {
            let s = Math.floor(num).toFixed(0);
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        },

        time: function(speed, distance) {
            const kmPerSecond = speed / SECONDS_IN_HOUR;
            return distance / kmPerSecond;
        },

        maxBounds: function(mapConfig) {
            return [
                [mapConfig.latMin - BORDER, mapConfig.lngMin - BORDER],
                [mapConfig.latMax + BORDER, mapConfig.lngMax + BORDER]
            ];
        },

        center: function(mapConfig) {
            return [mapConfig.latMax / 2, mapConfig.lngMax / 2];
        },

        gridLatLng: function(grid, mapConfig) {
            const width = mapConfig.lngMax - mapConfig.lngMin;
            const height = mapConfig.latMax - mapConfig.latMin;
            const gridWidth = width / mapConfig.lngGridMax;
            const gridHeight = height / mapConfig.latGridMax;
            const gridSideLength = (gridWidth + gridHeight) / 2;
            const gridLat = parseInt(grid.substring(0, 2));
            const gridLng = parseInt(grid.substring(2, 4));
            const lat = mapConfig.latMax - (gridLat * gridSideLength);
            const lng = (gridLng * gridSideLength);
            return [lat, lng];
        },

        invertHeading: function(heading) {
            return (360 + (heading - 180)) % 360;
        },
    };
})();
