/*
* This package manages the connection to the il2missionplanner API.
* */
module.exports = (function() {

    const util = require('./util.js');

    const
        WEBDIS_HOST = 'https://api.il2missionplanner.com:80' // TODO: make this more easily configurable (no magic numbers)
    ;

    return {

        scripts: {
            getChannel: '',
            publishState: '',
            newStream: '',
            getReconnect: ''
        },

        init: function() {
            const requiredKeys = Object.keys(this.scripts);
            const response = this.hmget('scripts', requiredKeys);
            if (response.length !== requiredKeys.length) {
                return false;
            }
            for (let i = 0; i < response.length; i++) {
                this.scripts[requiredKeys[i]] = response[i];
            }
            return true;
        },

        publish: function(stream, password, code, state) { // jshint ignore:line
            const url = this._buildEvalshaUrl(this.scripts.publishState, [stream, password, code, state]);
            const xhr = util.buildGetXhr(url, function () {
                if (xhr.readyState === 4) {
                    const responseBody = JSON.parse(xhr.responseText).EVALSHA;
                    if (responseBody[0] !== 'SUCCESS') {
                        this._errorHandler();
                    }
                }
            });
        },

        /**
         * hmget made the initial call to the API that checks their status.
         * The call has been disabled.
         * I'm keeping the function definition as a placeholder for future functionality.
         *
         * @param key
         * @param fields
         * @returns {*}
         */
        hmget: function(key, fields) {
            const url = this._buildHmgetUrl(key, fields);
            const response = util.buildSyncGetXhr(url);
            return JSON.parse(response.responseText).HMGET;
        },

        subscribe: function(channel) {
            let prev_length = 0;
            const url = this._buildSubscribeUrl(channel);
            const xhr = util.buildGetXhr(url, function () {
                if (xhr.readyState === 3) {
                    const response = xhr.responseText;
                    try {
                        const chunk = JSON.parse(response.slice(prev_length));
                        if (!chunk || typeof chunk !== 'object') {
                            this._errorHandler();
                        }
                    } catch (e) {
                        this._errorHandler();
                    } // TODO: understand better the next line and the whole function
                    const newState = chunk.SUBSCRIBE[2]; // jshint ignore:line
                    prev_length = response.length;
                    const evt = new CustomEvent('il2:streamupdate', {detail: newState});
                    window.dispatchEvent(evt);
                }
            });
        },

        unsubscribe: function(channel) {
            const url = this._buildUnsubscribeUrl(channel);
            util.buildGetXhr(url, function(){});
        },

        getStreamList: function() {
            const url = this._buildKeysUrl('stream:*');
            const response = util.buildSyncGetXhr(url);
            return JSON.parse(response.responseText).KEYS;
        },

        getStreamInfo: function(stream, password) {
            const url = this._buildEvalshaUrl(this.scripts.getChannel, [stream, password]);
            const response = util.buildSyncGetXhr(url);
            return JSON.parse(response.responseText).EVALSHA;
        },

        getStreamReconnect: function(stream, password, code) {
            const url = this._buildEvalshaUrl(this.scripts.getReconnect, [stream, password, code]);
            const response = util.buildSyncGetXhr(url);
            return JSON.parse(response.responseText).EVALSHA;
        },

        startStream: function(name, password, code, state) {// jshint ignore:line
            const url = this._buildEvalshaUrl(this.scripts.newStream, [name, password, code, state]);
            const response = util.buildSyncGetXhr(url);
            return JSON.parse(response.responseText).EVALSHA;
        },

        _buildEvalshaUrl: function(hash, args) {
            let url = WEBDIS_HOST + '/EVALSHA/' + hash + '/0';
            for (let i = 0; i < args.length; i++) {
                url += ('/' + args[i]);
            }
            return url;
        },

        _buildHmgetUrl: function(key, fields) {
            let url = WEBDIS_HOST + '/HMGET/' + key;
            for (let i = 0; i < fields.length; i++) {
                url += ('/' + fields[i]);
            }
            return url;
        },

        _buildKeysUrl: function(pattern) {
            return WEBDIS_HOST + '/KEYS/' + pattern;
        },

        _buildSubscribeUrl: function(channel) {
            return WEBDIS_HOST + '/SUBSCRIBE/' + channel;
        },

        _buildPublishUrl: function(channel, value) {
            return WEBDIS_HOST + '/PUBLISH/' + channel + '/' + value;
        },

        _buildUnsubscribeUrl: function(channel) {
            return WEBDIS_HOST + '/UNSUBSCRIBE/' + channel;
        },

        _errorHandler: function() {
            const evt = new CustomEvent('il2:streamerror');
            window.dispatchEvent(evt);
        }
    };
})();
