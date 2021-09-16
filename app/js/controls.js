(function() {

    const content = require('./content.js');

    L.Control.TitleControl = L.Control.extend({

        options: {
            position: 'topright'
        },

        onAdd: function(e) {
            L.DomEvent.stop(e);
            const container = L.DomUtil.create('div', 'title-control');
            L.DomEvent.disableClickPropagation(container);
            container.innerHTML = content.titleText;
            return container;
        }
    });

    L.Control.CustomToolbar = L.Control.extend({

        options: {
            position: 'bottomleft'
        },

        initialize: function(options) {
            L.Control.prototype.initialize.call(this, options);
        },

        onAdd: function(e) {
            L.DomEvent.stop(e);
            const container = L.DomUtil.create('div', 'leaflet-bar');
            L.DomEvent.disableClickPropagation(container);
            for (let i = 0; i < this.options.buttons.length; i++) {
                const link = L.DomUtil.create('a', 'fa ' + this.options.buttons[i].icon, container);
                link.title = this.options.buttons[i].tooltip;
                link.id = this.options.buttons[i].id;
                link.addEventListener('click', this.options.buttons[i].clickFn);
            }
            return container;
        }
    });

})();
