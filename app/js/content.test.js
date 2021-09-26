const assert = require('chai').assert;

const mockLeaflet = {};
const content = require('./content.js');

describe('content', function() {

    it('must be defined', function() {
        assert.isDefined(content);
    });

    const tests = [
        {
            property: 'maps'
        },
        {
            property: 'augmentedLeafletDrawLocal'
        }
    ];

    tests.forEach(function(test) {
        it('must have property \''+test.property+'\'', function() {
            assert.property(content, test.property);
        });
    });
});
