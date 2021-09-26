const assert = require('chai').assert;

const calc = require('./calc.js');

function strLatLng(latLng) {
    return '('+latLng.lat+','+latLng.lng+')';
}

describe('calc', function() {

    it('must be defined', function() {
        assert.isDefined(calc);
    });

    describe('calc.distance', function() {

        it('must be defined', function() {
            assert.isDefined(calc.distance);
        });

        const tests = [
            {
                a: {lat: 0, lng: 1},
                b: {lat: 1, lng: 1},
                expectedDistance: 1
            },
            {
                a: {lat: 0, lng: 0},
                b: {lat: 0, lng: -1},
                expectedDistance: 1
            },
            {
                a: {lat: 0, lng: 0},
                b: {lat: 1, lng: 1},
                expectedDistance: Math.sqrt(2)
            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expectedDistance+' given '+strLatLng(test.a)+' and '+strLatLng(test.b), function() {
                assert.strictEqual(calc.distance(test.a, test.b), test.expectedDistance);
            });
        });
    });

    describe('calc.geometricDegreesToGeographic', function() {

        it('must be defined', function() {
            assert.isDefined(calc.geometricDegreesToGeographic);
        });

        const tests = [
            {
                expected: 90,
                given: 0
            },
            {
                expected: 0,
                given: 90
            },
            {
                expected: 270,
                given: 180
            },
            {
                expected: 180,
                given: 270
            },
            {
                expected: 90,
                given: 360
            },
        ];

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.given, function() {
                assert.strictEqual(calc.geometricDegreesToGeographic(test.given), test.expected);
            });
        });
    });

    describe('calc.heading', function() {

        it('must be defined', function() {
            assert.isDefined(calc.heading);
        });

        const tests = [
            {
                a: {lat: 1, lng: 1},
                b: {lat: 0, lng: 1},
                expectedHeading: 180
            },
            {
                a: {lat: 0, lng: 1},
                b: {lat: 1, lng: 1},
                expectedHeading: 0
            },
            {
                a: {lat: 1, lng: 2},
                b: {lat: 1, lng: 0},
                expectedHeading: 270
            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expectedHeading+' given '+strLatLng(test.a)+' and '+strLatLng(test.b), function() {
                assert.strictEqual(calc.heading(test.a, test.b), test.expectedHeading);
            });
        });
    });

    describe('calc.pad', function() {

        it('must be defined', function() {
            assert.isDefined(calc.pad);
        });

        const tests = [
            {
                num: 90,
                digits: 3,
                expected: '090'
            },
            {
                num: 270,
                digits: 3,
                expected: '270'
            },
            {
                num: 1,
                digits: 3,
                expected: '001'

            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.num+' and '+test.digits, function() {
                assert.strictEqual(calc.pad(test.num, test.digits), test.expected);
            });
        });
    });

    describe('calc.time', function() {

        it('must be defined', function() {
            assert.isDefined(calc.time);
        });

        const tests = [
            {
                speed: 300,
                distance: 20,
                expected: 240
            },
            {
                speed: 1,
                distance: 1,
                expected: 3600
            },
            {
                speed: 300,
                distance: 10,
                expected: 120

            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.speed+' and '+test.distance, function() {
                assert.strictEqual(calc.time(test.speed, test.distance), test.expected);
            });
        });
    });

    describe('calc.maxBounds', function() {

        it('must be defined', function() {
            assert.isDefined(calc.maxBounds);
        });

        const tests = [
            {
                given: {
                    latMin: 0,
                    latMax: 10,
                    lngMin: 0,
                    lngMax: 10
                },
                expected: [[-5, -5], [15, 15]]
            },
            {
                given: {
                    latMin: 0,
                    latMax: 100,
                    lngMin: 0,
                    lngMax: 100
                },
                expected: [[-5, -5], [105, 105]]
            }
        ];

        tests.forEach(function(test) {
            it('must return '+JSON.stringify(test.expected)+' given '+JSON.stringify(test.given), function() {
                assert.deepEqual(calc.maxBounds(test.given), test.expected);
            });
        });
    });

    describe('calc.center', function() {

        it('must be defined', function() {
            assert.isDefined(calc.center);
        });

        const tests = [
            {
                given: {
                    latMax: 10,
                    lngMax: 10
                },
                expected: [5, 5]
            }
        ];

        tests.forEach(function(test) {
            it('must return '+JSON.stringify(test.expected)+' given '+JSON.stringify(test.given), function() {
                assert.deepEqual(calc.center(test.given), test.expected);
            });
        });
    });

    describe('calc.gridLatLng', function() {

        it('must be defined', function() {
            assert.isDefined(calc.center);
        });

        const tests = [
            {
                given: {
                    grid: '0101',
                    map: {
                        latMin: 0,
                        latMax: 160,
                        latGridMax: 11,
                        lngMin: 0,
                        lngMax: 224,
                        lngGridMax: 17,
                    }
                },
                expected: [146, 13.5]
            },
            {
                given: {
                    grid: '1101',
                    map: {
                        latMin: 0,
                        latMax: 160,
                        latGridMax: 11,
                        lngMin: 0,
                        lngMax: 224,
                        lngGridMax: 17,
                    }
                },
                expected: [7.5, 13.5]
            }
        ];

        function latLngFloatEqual(given, expected) {
            const EPSILON = 0.5;
            const latMax = expected[0] + EPSILON;
            const latMin = expected[0] - EPSILON;
            const lngMax = expected[1] + EPSILON;
            const lngMin = expected[1] - EPSILON;
            return given[0] < latMax && given[0] > latMin && given[1] < lngMax && given[1] > lngMin;
        }

        tests.forEach(function(test) {
            it('must return '+JSON.stringify(test.expected)+' given '+JSON.stringify(test.given), function() {
                const result = calc.gridLatLng(test.given.grid, test.given.map);
                assert(latLngFloatEqual(result, test.expected));
            });
        });
    });

    describe('calc.invertHeading', function() {

        it('must be defined', function() {
            assert.isDefined(calc.invertHeading);
        });

        const tests = [
            {
                given: 116,
                expected: 296
            },
            {
                given: 360,
                expected: 180
            },
            {
                given: 0,
                expected: 180
            }
        ];

        tests.forEach(function(test) {
            it('must return '+test.expected+' given '+test.given, function() {
                const result = calc.invertHeading(test.given);
                assert.equal(result, test.expected);
            });
        });
    });
});
