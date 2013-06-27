var args = arguments[0] || {};

var isAndroid = Ti.Platform.osname == 'android';

if (isAndroid) {
	// Landscape Mode
	var screenWidth = Ti.Platform.displayCaps.platformHeight;
	var screenHeight = Ti.Platform.displayCaps.platformWidth;
} else {
	var screenWidth = Ti.Platform.displayCaps.platformWidth;
	var screenHeight = Ti.Platform.displayCaps.platformHeight;
}

var halfScreenHeight = screenHeight / 2;
var halfScreenWidth = screenWidth / 2;

var overlay = $.overlay;
overlay.height = screenHeight;
overlay.width = screenWidth;
$.arContainer.height = screenHeight;
$.arContainer.width = screenWidth;

var MAX_ZOOM = 1.0;
var MIN_ZOOM = 0.35;
var DELTA_ZOOM = MAX_ZOOM - MIN_ZOOM;

var MIN_Y = Math.floor(screenHeight / 6);

var MAX_Y = Math.floor(screenHeight / 4 * 3);
var DELTA_Y = MAX_Y - MIN_Y;

// Setup the location  properties for callbacks
Ti.Geolocation.headingFilter = 1;
Ti.Geolocation.showCalibration = false;

if (isAndroid) {
	Ti.Geolocation.Android.accuracy = Ti.Geolocation.ACCURACY_HIGH;
	Ti.Geolocation.accuracy = Ti.Geolocation.ACCURACY_HIGH;
} else {
	Ti.Geolocation.distanceFilter = 10;
	Ti.Geolocation.preferredProvider = "gps";
	Ti.Geolocation.accuracy = Ti.Geolocation.ACCURACY_NEAREST_TEN_METERS;
	Ti.Geolocation.purpose = "Augmented Reality";
}

var yOffset = 0;
var stability = .6;
var volatility = 1 - stability;
var PI_2 = Math.PI/2;
var viewAngle; // from 0 (looking straight up) to PI (looking straight down)

function accelerate(e) {
	viewAngle = Math.atan2(e.y, e.z);
	yOffset = stability * yOffset + volatility * (halfScreenHeight * (viewAngle + PI_2));
	
	updatePoiViews();
}
var acc = require(WPATH('accelerometer'));
acc.setupCallback(accelerate);
acc.start();


function showAR() {
	Ti.Geolocation.addEventListener('heading', headingCallback);
	Ti.Geolocation.addEventListener('location', locationCallback);
	Ti.Media.showCamera({
		success : function(event) {
		},
		cancel : function() {
			// only gets called if Android
			closeAR();
		},
		error : function(error) {
			alert('unable to open camera view');
//			closeAR();
		},
		mediaTypes : [Ti.Media.MEDIA_TYPE_VIDEO, Ti.Media.MEDIA_TYPE_PHOTO],
		showControls : false,
		autohide : false,
		autofocus : "off",
		animated : false,
		overlay : overlay
	});
}

function closeAR() {
	acc.destroy();
	Ti.Geolocation.removeEventListener('heading', headingCallback);
	Ti.Geolocation.removeEventListener('location', locationCallback);
	if (!isAndroid) {
		Ti.Media.hideCamera();
	}
	setTimeout(function() {
		$.win.close();
	}, 500);
}




var deviceLocation = null;
var deviceBearing = 1;


var arContainer = $.arContainer;
var headingLabel = $.headingLabel;
var radar = $.radarView;

if (args.overlay) {
	overlay.add(args.overlay);
}



// iPhone camera sees about 30 degrees left to right
var FIELD_OF_VIEW = 30;

var maxRange = 1000;

if (args.maxDistance) {
	maxRange = args.maxDistance;
}

$.win.addEventListener('open', function() {
	Ti.API.debug('AR Window Open...');
	setTimeout(showAR, 500);
});
function doClose() {
	closeAR();
};
$.closeButton.addEventListener('click', closeAR);

if (args.initialLocation) {
	deviceLocation = args.initialLocation;
}

function assignPOIs(_pois) {

	pois = _pois;

	attachArViewsToPois(pois);

	addViews();
	createRadarBlips();
	
	if (deviceLocation && deviceBearing) {
		updateRelativePositions();
	}

}

if (args.pois) {
	assignPOIs(args.pois);
}

function poiClick(e) {
	Ti.API.info(e.source);
}


/**
 * Device has indicated a new location
 * @param {Object} e
 */
function locationCallback(e) {

	deviceLocation = e.coords;
	
	if (!deviceLocation) {
		Ti.API.warn("location not known. Can't draw pois");
		return;
	}
	else {

		updateRelativePositions();

		for (i=0, l=pois.length; i<l; i++) {
			var poi = pois[i];
			positionRadarBlip(poi);
		}

		updatePoiViews();
	}
};


/**
 * Compass has indicated a new heading
 * 
 * @param {Object} e
 */
function headingCallback(e) {

	deviceBearing = e.heading.trueHeading;

	// REM this if you don't want the user to see their heading
	headingLabel.text = Math.floor(deviceBearing) + "\xB0";

	// point the radar view
	radar.transform = Ti.UI.create2DMatrix().rotate(-1 * deviceBearing);
	
	updatePoiViews();
}

var minPoiDistance, maxPoiDistance;
var distanceRange = 1;
var minPoiScale = .3, maxPoiScale = 1;
var poiScaleRange = maxPoiScale - minPoiScale;

/**
 * Calculate heading/distance of each poi from deviceLocation
 */
function updateRelativePositions() {
	
	minPoiDistance = 1000000;
	maxPoiDistance = 0;

	for (i=0, l=pois.length; i<l; i++) {

//Ti.API.info('poi '+i);
		var poi = pois[i];
		
		if (poi.view) {

			poi.distance = calculateDistance(deviceLocation, poi);
//Ti.API.info('poi = '+poi.latitude+','+poi.longitude);
//Ti.API.info('deviceLocation = '+deviceLocation.latitude+','+deviceLocation.longitude);
//Ti.API.info('poi.distance = '+poi.distance);

			if (maxRange && (poi.distance <= maxRange) ) {
				
				maxPoiDistance = Math.max(maxPoiDistance, poi.distance);
				minPoiDistance = Math.min(minPoiDistance, poi.distance);
				
				poi.inRange = true;
				poi.bearing = calculateBearing(deviceLocation, poi);
				
				positionRadarBlip(poi);

//Ti.API.info('poi.bearing = '+poi.bearing);
			} 
			else {
				// don't show pois that are beyond maxDistance
				poi.inRange = false;
//				Ti.API.debug(poi.title + " not added, maxRange=" + maxRange);
			}
		}
		else {
			// don't show pois that don't have views
			poi.inRange = false;
		}
	}
	
	poiDistanceRange = maxPoiDistance - minPoiDistance;

	// Sort by Distance
	pois.sort(function(a, b) {
		return b.distance - a.distance;
	});
	
	for (i=0, l=pois.length; i<l; i++) {
		pois[i].view.zIndex = i;
	}
}

var limitLeft = -halfScreenWidth - 100;
var limitRight = +halfScreenWidth + 100;

var lowY = screenHeight/2 * .8;
var highY = -screenHeight/2 * .8;
var yRange = highY - lowY;

function updatePoiViews() {

	for (i=0, l=pois.length; i<l; i++) {

		var poi = pois[i];

		if (poi.inRange) {

			poi.blip.visible = true;

			var horizontalPositionInScene = projectBearingIntoScene(poi.bearing);
//Ti.API.info('horizontalPositionInScene = '+horizontalPositionInScene);

			if ((horizontalPositionInScene > limitLeft) && (horizontalPositionInScene < limitRight)) {
				poi.view.visible = true;

				// Apply the transform
				var transform = Ti.UI.create2DMatrix();

				var distanceRank = (poi.distance - minPoiDistance) / poiDistanceRange;

				var y = lowY + distanceRank * yRange + yOffset;
				// this translation is from the center of the screen
				transform = transform.translate(horizontalPositionInScene, y);


				var scale = maxPoiScale - distanceRank * poiScaleRange;
				transform = transform.scale(scale);

				poi.view.transform = transform;
				
			}
			else {
				poi.view.visible = false;
			}

		}
		else {
			poi.view.visible = false;
			poi.blip.visible = false;
		}
	}
}


function addViews() {
	for (i=0, l=pois.length; i<l; i++) {
		var poi = pois[i];
		if (poi.view) {

			poi.view.addEventListener('click', poiClick);

			poi.view.visible = false;
			poi.inRange = true;
			
			$.arContainer.add(poi.view);
		}
	}
}

function createRadarBlips() {

	for (i=0, l=pois.length; i<l; i++) {

		var poi = pois[i];
		// add to blip to the radar
		// The Radar Blips ....

		var displayBlip = Ti.UI.createView({
			height : '3dp',
			width : '3dp',
			backgroundColor : 'white',
			borderRadius : 2,
		});
		
		poi.blip = displayBlip;

		positionRadarBlip(poi);		
		
		radar.add(displayBlip);
	}
}


function positionRadarBlip(poi) {

	var rad = toRad(poi.bearing + 90);

	var relativeDistance = poi.distance / (maxRange * 1.2);
	var x = (40 + (relativeDistance * 40 * Math.cos(rad)));
	var y = (40 - (relativeDistance * 40 * Math.sin(rad)));
	
	poi.blip.left = (x - 1) + "dp";
	poi.blip.top = (y - 1) + "dp";
}



/**
 * Calculate the pixel left/right position of a particular bearing, using device bearing.
 * 
 * @param {Object} poiBearing
 */
function projectBearingIntoScene(poiBearing) {

	var delta = findAngularDistance(poiBearing, deviceBearing);
//Ti.API.info('delta = '+delta);	
	return delta * screenWidth / FIELD_OF_VIEW;

}


/**
 * Finds the separation between angles theta1 and theta2 (in degrees)
 */
function findAngularDistance(theta1, theta2) {
	var a = theta1 - theta2;
	if (a > 180) a -= 360;
	if (a < -180) a += 360;
	return a;
}

function toRad(val) {
	return val * Math.PI / 180;
};

/**
 * Which direction to get from point1 to point2?
 * @param {Object} point1
 * @param {Object} point2
 */
function calculateBearing(point1, point2) {
	var lat1 = toRad(point1.latitude);
	var lat2 = toRad(point2.latitude);
	var dlng = toRad((point2.longitude - point1.longitude));
	var y = Math.sin(dlng) * Math.cos(lat2);
	var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlng);
	var brng = Math.atan2(y, x);
	return ((brng * (180 / Math.PI)) + 360) % 360;
};

/**
 * Find geo-distance betwixt two locations on earth's surface
 * @param {Object} loc1
 * @param {Object} loc2
 */
function calculateDistance(loc1, loc2) {
	var R = 6371;	// Radius of the earth in km
	var dLat = (toRad(loc2.latitude - loc1.latitude));
	// Javascript functions in radians
	var dLon = (toRad(loc2.longitude - loc1.longitude));
	var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(loc1.latitude)) * Math.cos(toRad(loc2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	// Distance in m
	return R * c * 1000;
};



function attachArViewsToPois(pois) {
	
	for (var i=0; i < pois.length; i++) {
		
		var poi = pois[i];
		
		var view = require('/alloy').createWidget('ArView', 'poi', {
			id: poi.id,
			title: poi.title,
			image: poi.image,
			rating: "rating: " + poi.rating
		}).getView();

		poi.view = view;
	}
}


exports = {
	findAngularDistance: findAngularDistance,
	calculateDistance: calculateDistance,
	calculateBearing: calculateBearing,
	toRad: toRad,
	doClose: doClose,
	closeAR: closeAR
};

