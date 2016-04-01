(function() {

    L.Control.TitleControl = L.Control.extend({

        options: {
            position: 'topright'
        },

        onAdd: function(e) {
            L.DomEvent.stop(e);
            var container = L.DomUtil.create('div', 'title-control');
            L.DomEvent.disableClickPropagation(container);
            container.innerHTML = 'Il-2: Battle of Stalingrad Mission Planner';
            return container;
        }
    });

    L.Control.CustomButton = L.Control.extend({

        clickFn: null,
        iconClass: null,
        options: {
            position: 'bottomleft'
        },

        initialize: function(options, cls, fn) {
            L.Control.prototype.initialize.call(this, options);
            iconClass = cls;
            clickFn = fn;
        },

        onAdd: function(e) {
            L.DomEvent.stop(e);
            var container = L.DomUtil.create('div', 'leaflet-bar');
            L.DomEvent.disableClickPropagation(container);
            var link = L.DomUtil.create('a', 'fa '+iconClass, container);
            link.addEventListener('click', function() {
                clickFn();
            });
            return container;
        }
    });

})();
