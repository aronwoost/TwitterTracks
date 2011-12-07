
exports.init = init;

var models = sp.require("sp://import/scripts/api/models");
var views = sp.require("sp://import/scripts/api/views");
var settings = sp.require("settings");

var currentSinceId;

function init() {
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
			setTimeout(fetchTweetsAndAddToPlaylist, 10000, playlist);
			return;
		}
	    addToPlaylist(playlist, uriArray, function(){
	    	setTimeout(fetchTweetsAndAddToPlaylist, 10000, playlist);
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

	// create a new array with the url's only
	var arr = data.map(function(item){
		return item.entities.urls[0].expanded_url;
	});

	// check the url's
	async.map(arr, function(item, callback){
		if(item.indexOf("open.spotify.com") !== -1) {
			callback(null, item);
		} else if(item.indexOf("spoti.fi") !== -1) {
			$.ajax({
				type: "GET",
				url: "http://api.bitly.com/v3/expand?shortUrl="+encodeURIComponent(item)+"&login="+settings.bitlyUsername+"&apiKey="+settings.bitlyApiKey,
				dataType: "jsonp",
				success: function (data) {	
					if(!data.data || data.data.expand[0].error) {
						console.log("bit.ly url not found");
						callback(null, "none");
					} else {
						var longUrl = data.data.expand[0].long_url;
						callback(null, longUrl);
					}
				},
				error: function() {
					console.log("bit.ly error");
					callback(null, "none");
				}
			});		
		} else {
			console.log("none spotify: "+item);
			callback(null, "none");
		}
	}, function(err, results){
		// remove the "none" once
		var arr = results.filter(function(item, index, array){
			return item !== "none";
		});
		console.log("Stats: "+data.length+" tweets, "+arr.length+" contained spotify links");
		callback(arr);
	});
}

function addToPlaylist(playlist, uriArray, callback) {
	async.forEachSeries(uriArray, function(item, callback){
		processUri(item, playlist, callback);
	}, function(err){
		callback();
	});		
};

function processUri(uri, playlist, callback) {
	var type = models.Link.getType(uri);
	if(type === 4) { //track
		var track = models.Track.fromURI(uri, function(a) {
			if(a.data.availableForPlayback) {
			    playlist.add(a);
			}
		    callback();
		});		
	} else if(type === 2) { //album
		var album = models.Album.fromURI(uri, function(a){
			a.data.tracks.forEach(function(element, index, array) {  
				var o = new models.Track(element);
				if(element.availableForPlayback) {
				    playlist.add(o);
				}
			});
			callback();
		});
	} else {
		callback();
	}
}