
exports.init = init;

var models = sp.require("sp://import/scripts/api/models");
var views = sp.require("sp://import/scripts/api/views");
var settings = sp.require("settings");

console.dir(settings);

var currentSinceId;

function init() {
	console.log("init()");

	var playlist = new models.Playlist("TwitterTracks");
	playlist.subscribed = false;

    var listView = new views.List(playlist);

    var content = document.getElementById("content");
    content.appendChild(listView.node);	

    fetchTweetsAndAddToPlaylist(playlist);
}

function fetchTweetsAndAddToPlaylist(playlist) {
	searchTwitter(function(uriArray){
		if(uriArray.length === 0) {
			setTimeout(fetchTweetsAndAddToPlaylist, 5000, playlist);
			return;
		}
	    addToPlaylist(playlist, uriArray, 0, function(){
	    	setTimeout(fetchTweetsAndAddToPlaylist, 5000, playlist);
	    });
	});
}

function searchTwitter(callback) {
	var reqUrl = "http://search.twitter.com/search.json?q=spotify%20filter:links&include_entities=true&result_type=recent&rpp=100";

	if(currentSinceId) {
		reqUrl += "&since_id="+currentSinceId;
	}

	$.ajax({
		type: "GET",
		url: reqUrl,
		dataType: "jsonp",
		success: function(data){
			processTweets(data.results, callback);
		}
	});
}

function processTweets(data, callback) {
	if(data.length === 0) {
		callback([]);
		return;
	}

	currentSinceId = data[0].id_str;

	var arr = data.filter(function(item, index, array){
		if(!item.entities.urls || item.entities.urls.length === 0) return false;
		var url = item.entities.urls[0].expanded_url;
		if(!url) return false;
		return url.indexOf("open.spotify.com") !== -1;
	}).map(function(item){
		return item.entities.urls[0].expanded_url;
	});

	console.log("Stats: "+data.length+" tweets, "+arr.length+" contained spotify links");

	callback(arr);
}

function addToPlaylist(playlist, uriArray, index, callback) {
    processUri(playlist, uriArray, index, function(){
    	if(++index === uriArray.length) {
    		callback();
	    	return;
	    }
    	addToPlaylist(playlist, uriArray, index, callback);
    });
};

function processUri(playlist, uriArray, index, callback) {
	var uri = uriArray[index];
	var type = models.Link.getType(uri);
	if(type === 4) { //track
		var track = models.Track.fromURI(uri, function(a) {
			if(a.data.availableForPlayback) {
			    playlist.add(a);
			}
		    callback(type);
		});		
	} else if(type === 2) { //album
		var album = models.Album.fromURI(uri, function(a){
			a.data.tracks.forEach(function(element, index, array) {  
				var o = new models.Track(element);
				if(element.availableForPlayback) {
				    playlist.add(o);
				}
			});
			callback(type);
		});
	} else {
		callback(type);
	}
}