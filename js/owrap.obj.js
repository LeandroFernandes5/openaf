// OpenWrap v2
// Author: Nuno Aguiar
// Obj
// 

OpenWrap.obj = function() {
	return ow.obj;
}

/**
 * <odoc>
 * <key>ow.obj.fromDBRS2Obj(aDBRS, doDates) : Map</key>
 * Converts a Java database result set object (retrieved with DB.qsRS) into a map where the key is the name
 * of the field in upper case. Optionally doDates will convert any SQL dates into javascript Date objects.
 * </odoc>
 */
OpenWrap.obj.prototype.fromDBRS2Obj = function (aDBRS, doDates) {
	var res = {};

	for(var i = 1; i <= aDBRS.getMetaData().getColumnCount(); i++) {
		if (aDBRS.getObject(i) != null) {
			switch(aDBRS.getMetaData().getColumnType(i)) {
			case java.sql.Types.NUMERIC: 
			case java.sql.Types.DOUBLE:
			case java.sql.Types.FLOAT:
			case java.sql.Types.DECIMAL: res[aDBRS.getMetaData().getColumnName(i)] = Number(aDBRS.getDouble(i)); break;
			case java.sql.Types.CLOB: res[aDBRS.getMetaData().getColumnName(i)] = Packages.org.apache.commons.io.IOUtils.copy(aDBRS.getClob(i).getAsciiStream()); break;
			case java.sql.Types.BINARY:
			case java.sql.Types.BLOB: res[aDBRS.getMetaData().getColumnName(i)] = Packages.org.apache.commons.io.IOUtils.toByteArray(aDBRS.getBlob(i).getBinaryStream()); break;
			case java.sql.Types.TIMESTAMP: if (doDates) { res[aDBRS.getMetaData().getColumnName(i)] = new Date(aDBRS.getTimestamp(i).getTime()); break; }
			case java.sql.Types.DATE: if (doDates) { res[aDBRS.getMetaData().getColumnName(i)] = new Date(aDBRS.getDate(i).getTime()); break; }
			default: res[aDBRS.getMetaData().getColumnName(i)] = String(aDBRS.getString(i)); break;
			}
		} else {
			res[aDBRS.getMetaData().getColumnName(i)] = null;
		}
	}

	return res;
};

/**
 * <odoc>
 * <key>ow.obj.fromDBRS(aDB, aSQL, anArrayOfBinds, aFunction, anErrorFunction)</key>
 * Given a connected aDB the query aSQL will be executed (using the anArrayOfBinds) and the corresponding result set will be iterated. For each row the aFunction will be 
 * called with the result of ow.obj.fromDBRS2Obj with doDates = true. If the function returns false the result set iteration will be immediatelly stopped. Any exception 
 * thrown by aFunction will be handled by anErrorFunction (by default throws the exception).
 * </odoc>
 */
OpenWrap.obj.prototype.fromDBRS = function(aDB, aSQL, aBinds, aFunction, aErrorFunction) {
	_$(aSQL).isString("The SQL statement needs to be a string.").$_("Please provide a SQL statement.");
	_$(aFunction).isFunction().$_("Please provide a function.");
	aErrorFunction = _$(aErrorFunction).isFunction().default(function(e) {
		throw e;
	});

	var rs = aDB.qsRS(aSQL, aBinds), cont = true;
	while(rs.next() && cont) {
		try {
			var res = aFunction(ow.obj.fromDBRS2Obj(rs, true));
			if (isDef(res) && res == false) cont = false;
		} catch(e) {
			aErrorFunction(e);
		}
	}
	rs.close();
};

/**
 * <odoc>
 * <key>ow.obj.fromArray2DB(anArray, aDB, aDBTable, useParallel,caseSensitive) : Number</key>
 * Given anArray composed of maps where each key is a field name tries to insert into the aDBTable
 * for a provided aDB. Optionally you can specify how many threads should be used with useParallel
 * and use the case sensitive name of fields with caseSensitive = true.
 * This function doesn't perform any database commit. Returns the number of records inserted.
 * (available after ow.loadObj())
 * </odoc>
 */
OpenWrap.obj.prototype.fromArray2DB = function(anArray, aDB, aTableName, useParallel, caseSensitive) {
	if (isUnDef(useParallel)) useParallel = getNumberOfCores();

	if (isUnDef(anArray) || anArray.length < 1) return 0;
	if (useParallel < 1) useParallel = 1;

	var okeys, ookeys = Object.keys(anArray[0]);
	if (caseSensitive) 
		okeys = "\"" + ookeys.join("\", \"") + "\"";
	else 
		okeys = ookeys.join(",").toUpperCase();

	var binds = [];
	ookeys.forEach((v) => {
		binds.push("?");
	});
	var ctrl = {};

	var t = parallel4Array(anArray,
		function(aValue) {
			var values = [];
			for(var k in ookeys) {
				values.push(aValue[ookeys[k]]);
			}
			return aDB.us("insert into " + (caseSensitive ? "\"" + aTableName + "\"" : aTableName) + "(" + okeys + ") values (" + binds.join(",") + ")", values);
		},
		useParallel,
		ctrl
	);
	return t.length;
};

/**
 * <odoc>
 * <key>ow.obj.fromObj2DBTableCreate(aTableName, aMap, aOverrideMap, enforceCase) : String</key>
 * Returns a DB table create, for aTableName, from the provided aMap key entries. To override the default field type guessing a aOverrideMap can 
 * be provided with field entries and the corresponding type as value. Optionally if enforceCase = true table name and fields names will be enforced case
 * by using double quotes.
 * </odoc>
 */
OpenWrap.obj.prototype.fromObj2DBTableCreate = function(aTableName, aMap, aOverrideMap, enforceCase) {
	aTableName = _$(aTableName, "table name").isString().$_();
	aMap = _$(aMap, "map").isMap().$_();
	aOverrideMap = _$(aOverrideMap, "override map").isMap().default({});
	enforceCase = _$(enforceCase, "enforce case").isBoolean().default(false);
 
	var m = [];
	var keys = Object.keys(aMap);
	for(var ii in keys) {
	   var key = (enforceCase ? "\"" + keys[ii] + "\"" : keys[ii]);
 
	   m.push({
		  f: key,
		  s: (isDef(aOverrideMap[key]) ? aOverrideMap[key] : (isNumber(aMap[key]) ? "NUMBER" : "VARCHAR"))
	   });
	}
 
	return templify("CREATE TABLE {{{table}}} ({{{fields}}})", { 
		table: (enforceCase ? "\""+ aTableName + "\"" : aTableName), 
		fields: (m.map(r => r.f + " " + r.s).join(", ")) 
	});
};

/**
 * <odoc>
 * <key>ow.obj.fromArray2OrderedObj(anArray) : Map</key>
 * Converts the provided anArray into a Map where each array entry is converted to a map entry 
 * which ordered will provide the same ordering found on the array.
 * (available after ow.loadObj())
 * </odoc>
 */
OpenWrap.obj.prototype.fromArray2OrderedObj = function(anArray) {
	if (isUnDef(anArray) || anArray.length < 1) return {};
	
	var res = {};
	for (var i in anArray) {
		res[i] = anArray[i];
	}
	
	return res;
}

/**
 * <odoc>
 * <key>ow.obj.fromOrderedObj2Array(aMap, aKeySortFunction) : Array</key>
 * Converts a provided aMap into an array where each element will be composed from the maps entries ordered
 * by the corresponding key. Optionally you can provide aKeySortFunction that will accept two arguments and
 * work similarly to javascript's array sorting functions.
 * (available after ow.loadObj())
 * </odoc>
 */
OpenWrap.obj.prototype.fromOrderedObj2Array = function(anObj, aKeySortFunction) {
	if (isUnDef(anObj) || Object.keys(anObj).length < 1) return [];
	if (isUnDef(aKeySortFunction)) aKeySortFunction = function(a, b) { 
		return a - b;
	}
	
	var oKeys = quickSort(Object.keys(anObj), aKeySortFunction);
	var res = [];
	for (var i in oKeys) {
		res.push(anObj[oKeys[i]]);
	}
	
	return res;
}

OpenWrap.obj.prototype.__getObj4Path = function(anObj, aPath) {
	aPath = String(aPath).split(/\./g);
	var obj = anObj;
	
    var index = 0;
    while(obj != null && index < aPath.length) {
        obj = obj[aPath[index++]];
    }

    return obj;
};

/**
 * <odoc>
 * <key>ow.obj.flatMap(data, separator) : Array/Map</key>
 * Given data as an array of maps or a single map tries to produce an output with only one level of keys per map.
 * Optionally you can provide a separator between parent keys and each key (defaults to '.').
 * </odoc>
 */
OpenWrap.obj.prototype.flatMap = function(data, separator) {
	if (!isArray(data) && !isMap(data)) throw "data argument needs to be an array or a map";
	separator = _$(separator, "separator").isString().default(".");

	var keys = [];

	var anArray = (isArray(data) ? data : [ data ]);
	if (anArray.length == 0) throw "need at least one element in data";
	var res1 = anArray.map(v => {
		var r = {};
		traverse(v, (aK, aV, aP, aO) => {
			if (aP.startsWith(".")) aP = aP.slice(1);
			if (!isMap(aV) && !isArray(aV)) r[aP + (aP.length > 0 ? separator : "") + aK] = aV;
		});
		keys = $from(Object.keys(r)).union(keys).select();
		return r;
	});

	var res2 = res1.map(v => {
		var r = {};
		keys.forEach(k => {
			r[k] = v[k];
		});
		return r;
	});

	if (isArray(data)) return res2; else return res2[0];
};

/**
 * <odoc>
 * <key>ow.obj.reorderArrayMap(aKs, aArray, removeUnDefs) : Array</key>
 * Given an array of keys (aKs) will project those for all maps in aArray (the ones not included with be included after).
 * Optionally if removeUnDefs = true it will not include keys with undefined fields (evaluated for every map in the array).
 * </odoc>
 */
OpenWrap.obj.prototype.reorderArrayMap = function (aKs, aArray, removeUnDefs) {
	_$(aKs, "aKs").isArray().$_();
	removeUnDefs = _$(removeUnDefs, "removeUnDefs").isBoolean().default(false);

	if (isMap(aArray)) aArray = [aArray];

	return aArray.map(r => {
		var res = {};
		var ks = Object.keys(r);
		var tks = ks.filter(k => aKs.indexOf(k) < 0);
		if (removeUnDefs) {
			aKs.forEach(k => { if (isDef(r[k])) res[k] = r[k] });
			tks.forEach(k => { if (isDef(r[k])) res[k] = r[k] });
		} else {
			aKs.forEach(k => { res[k] = r[k] });
			tks.forEach(k => { res[k] = r[k] });
		}
		return res;
	});
}


/**
 * <odoc>
 * <key>ow.obj.flatten(arrayOfMaps, aSeparator, aNADefault) : Array</key>
 * Converts any structured arrayOfMaps into a flat array of maps with only one level of keys. The map key path will be converted
 * into a single key using aSeparator (defaults to "_") and the value will be represented as aNADefault (defaults to "") when no 
 * value or key exists in other entries. For each array entry a new array element will be created replicated all other keys.
 * Usefull to convert data to output into CSV for example.
 * </odoc>
 */
OpenWrap.obj.prototype.flatten = function(data, aSeparator, aNADefault) {
	//if (!isArray(data)) throw "ow.obj.flatten: need an array of data.";
	if (isUnDef(aSeparator)) aSeparator = "_";
	if (isUnDef(aNADefault)) aNADefault = "";
	loadLodash();

	function getFlatUniqKey(aK, aP) {
		var key = "";
		if (isDef(aP)) {
			key = aP.replace(/\./g, aSeparator) + (isNumber(aK) ? "" : aSeparator + aK.replace(/\./g, aSeparator));
		} else {
			key = aK.replace(/\./g, aSeparator);
		}
	
		return key.replace(/\["?\d+"?\]/g, "").replace(new RegExp("^" + aSeparator), "");
	}
	
	function getFlatKeys(anArrayOfMaps) {
		var keys = [];
		if (isMap(anArrayOfMaps)) anArrayOfMaps = [ anArrayOfMaps ];
		anArrayOfMaps.forEach((r) => {
			traverse(r, (aK, aV, aP, aO) => {
				if (!isObject(aV)) keys.push(getFlatUniqKey(aK, aP));
			});
		});
	
		return _.uniq(keys);
	}
	
	function genFlatMap(flatKeys) {
		var res = {};
	
		for(var i in flatKeys) {
			res[flatKeys[i]] = aNADefault;
		}
	
		return res;
	}

	var keys = getFlatKeys(data);
	var resData = [];

	_trav = (aM, aD, aP) => {
		var _keys = Object.keys(aD);
		var parent = isUnDef(aP) ? "" : aP;
		var m = aM;
		var res = [];

		// First pass to get non-objects
		for(let j in _keys) {
			if (!isObject(aD[_keys[j]])) {
				m[getFlatUniqKey(_keys[j], parent)] = aD[_keys[j]];
			} 
		}

		// Second pass for maps
		for(let j in _keys) {
			if (isObject(aD[_keys[j]]) && !isArray(aD[_keys[j]])) {
				var newParent = parent + ((isNaN(Number(_keys[j]))) ? "." + _keys[j] : "");
				res = res.concat(_trav(aM, aD[_keys[j]], newParent));
			}
		}

		// Third pass for arrays
		for(let j in _keys) {
			if (isArray(aD[_keys[j]])) {
				var newParent = parent + ((isNaN(Number(_keys[j]))) ? "." + _keys[j] : "");
				for(let l in aD[_keys[j]]) {
					var nm = clone(m);
					if (isObject(aD[_keys[j]][l])) {
						res = res.concat(_trav(nm, aD[_keys[j]][l], newParent));
					} else {
						nm[_keys[j]] = aD[_keys[j]][l];
						res.push(nm);
					}
				}
			}
		}
		
		if (res.length == 0) res = [ m ];

		return _.uniq(_.flattenDeep(res));
	};

	if (isArray(data)) {
		for(var i in data) {
			resData = resData.concat(_trav(genFlatMap(keys), data[i]));
		}
	
		//return _.flattenDeep(resData);
		return resData;
	}

	if (isMap(data)) {
		var res = _trav(genFlatMap(keys), data);
		if (res.lenght > 0) return res[0]; else return __;
	}
};

/**
 * <odoc>
 * <key>ow.obj.fuzzySearch(anArrayOfKeys, anArrayOfObjects, searchString, fuseOptions) : Array</key>
 * Given anArrayOfObjects (similar objects) will fuzzy search the searchString on the values for the keys in anArrayOfKeys.
 * Returns an array of the most probable objects to match the searchString (you can use fuseOptions = { shouldSort: true } to 
 * ensure that the array is ordered by score).
 * It uses the FuseJS library internally so fuseOptions can be used to add more options (check more in http://fusejs.io/).\
 * \
 * For example:\
 *    ow.obj.fuzzySearch(["n"], [{n: "World War I"}, {n: "World War II"}, {n: "Name a war"}, {n: "Name some war"}], "world");\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.fuzzySearch = function(anArrayOfKeys, anArrayOfObjects, searchString, fuseOptions) {
	loadFuse();

	if (!isArray(anArrayOfObjects)) throw "anArrayOfObjects should be an array of objects.";
	if (!isArray(anArrayOfKeys)) throw "anArrayOfKeys should be an array of keys.";

	var fuse = new Fuse(anArrayOfObjects, merge({ keys: anArrayOfKeys }, fuseOptions));
	return fuse.search(searchString);
};

/**
 * <odoc>
 * <key>ow.obj.searchArray(anArray, aPartialMap, useRegEx, ignoreCase, useParallel) : Array</key>
 * Searches anArray of maps for entries where aPartialMap matches. If useRegEx is true all string entries
 * on aPartialMap will be interpreted as regular expressions. For number entries on the original map you can 
 * have the prefixes &gt;, &lt;, &gt;= and &lt;= to limit the numeric values. Optionally you can provide also
 * ignoreCase = true to ignore case (will only affect if useRegEx is true). And optionally also useParallel to
 * provide the number of threads to use. Example:\
 * \
 * ow.obj.searchArray(io.listFiles("/usr/bin").files, { "isFile": true, "filename": "^cal.*", "size": "&gt;=32000" }, true, true);\
 * \
 * // you can use it, for example, in conjunction with jLinq\
 * $from(ow.obj.searchArray(listFilesRecursive("/usr/lib"), { "filepath": "/usr/lib/ruby", "size": "&gt;100000" }, true)).sort("size").select();\
 * \
 * // to refer to a sub map value\
 * ow.obj.searchArray(students, { "details.age": "&lt;=25", "details.isMale": true }, true);\
 * \
 * (available after ow.loadObj())
 * </odoc>
 */
OpenWrap.obj.prototype.searchArray = function(anArray, aPartialMap, useRegEx, ignoreCase, useParallel) {
	if (isUnDef(useParallel)) useParallel = getNumberOfCores();
	if (useParallel < 1) useParallel = 1;

	var ctrl = {};
	var res = parallel4Array(anArray,
		function(aValue) {
			var okeys = Object.keys(aPartialMap);
			for(var k in okeys) {
				var ky = okeys[k];
				var vy = ow.obj.__getObj4Path(aValue, ky);
				if (useRegEx && (typeof aPartialMap[ky] == "string")) {
					if (aPartialMap[ky].match(/^([<>]=*)(\d+)/)) {
						var vs = aPartialMap[ky].match(/^([<>]=*)(\d+)/);
						if (vs[1] == ">=" && !(vs[2] <= vy)) { return undefined; }
						if (vs[1] == ">"  && !(vs[2] < vy)) { return undefined; }
						if (vs[1] == "<=" && !(vs[2] >= vy)) { return undefined; }
						if (vs[1] == "<"  && !(vs[2] > vy)) { return undefined; }
					} else {
						if (!String(vy).match(new RegExp(aPartialMap[ky], (ignoreCase) ? "i": ""))) { 
							return undefined; 
						};
					}
				} else {
					if (vy != aPartialMap[ky]) { 
						return undefined; 
					}
				}
			}
			return aValue;
		},
		useParallel,
		ctrl
	);

	var subres = [];
	for(var i in res) {
		if(res[i]) subres.push(res[i]);
	}

	return subres;
}

/**
 * <odoc>
 * <key>ow.obj.fromObj2Array(anObj, aKey) : Array</key>
 * Tries to create an array of maps from the provided anObj map of maps. Optionally if aKey is provided
 * it will be added to each array map with the map key. Example:\
 * \
 * var a = {\
 *    "A1": { "abc": "123", "xpt": "000" },\
 *    "A2": { "abc": "456", "xpt": "001" },\
 *    "A3": { "abc": "789", "xpt": "002" }\
 * }\
 * \
 * fromObj2Array(a, "key");\
 * // [\
 * //  { "key": "A1", "abc": "123", "xpt": "000" },\
 * //  { "key": "A2", "abc": "456", "xpt": "001" },\
 * //  { "key": "A3", "abc": "789", "xpt": "002" }\
 * // ]\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.fromObj2Array = function(aObj, aKey) {
	_$(aObj, "aObj").isMap().$_();

	var res = [];
	if (isUnDef(aKey)) {
		res = Object.values(aObj);
	} else {
		for(var i in aObj) {
			var item = clone(aObj[i]);
			item[aKey] = i;
			res.push(item);
		}
	}
	return res;
};

/**
 * <odoc>
 * <key>ow.obj.filterKeys(anArrayKeyNames, aMap) : Map</key>
 * Given aMap will return an equivalent Map with only the keys contained in the anArrayKeyNames.
 * Note: doesn't traverse existing sub-maps.
 * </odoc>
 */
OpenWrap.obj.prototype.filterKeys = function(anArrayKeyNames, aRow) {
	var keys = {};
	for(var i in anArrayKeyNames) {
		keys[anArrayKeyNames[i]] = aRow[anArrayKeyNames[i]];
	}
	return keys;
};

/**
 * <odoc>
 * <key>ow.obj.fromArray2Obj(anArray, aKey, dontRemove) : Array</key>
 * Tries to create a map of maps from the provided anArrays. Optionally if aKey is provided
 * it will be used to create the map keys (otherwise will fallback to "row[number]"). And can also
 * optionally indicate by dontRemove = true that aKey shouldn't be removed from each map.
 * \
 * var a = [\
 *   { "abc": "123", "xpt": "000", "key": "A1" },\
 *   { "abc": "456", "xpt": "001", "key": "A2" },\
 *   { "abc": "789", "xpt": "002", "key": "A3" }\
 * ]\
 * \
 * fromArray2Obj(a, "key");\
 * // {\
 * //   "A1": { "abc": "123", "xpt": "000" },\
 * //   "A2": { "abc": "456", "xpt": "001" },\
 * //   "A3": { "abc": "789", "xpt": "002" }\
 * // }\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.fromArray2Obj = function(anArray, aKey, dontRemove) {
	var res = {};
	for(var i in anArray) {
		var item = clone(anArray[i]);
		if (isDef(aKey) && isDef(item[aKey])) {
			res[item[aKey]] = item;
			if (!dontRemove) delete item[aKey];
		} else {
			res["row" + i] = item;
		}
	}
	return res;
};

OpenWrap.obj.prototype.pool = {
	/**
	 * <odoc>
	 * <key>ow.obj.pool.create() : Object</key>
	 * Creates an object pool with the ability to provide objects produce by a factory method and to close the objects when needed
	 * (if defined to have minimum and maximum number of objects in the pool). It's possible also to define a keep alive function.
	 * </odoc>
	 */
	create: function() {
		var res = {
			__pool: [],
			__factory: undefined,
			__close: undefined,
			__keepalive: undefined,
			__min: 0,
			__max: 0,
			__inc: 1,
			__timeout: 2000,
			__keepaliveTime: 0,
			__keepaliveThread: undefined,
			__retry: 10,
			__currentFree: 0,
			__currentSize: 0,
			
			/**
			 * <odoc><key>ow.obj.pool.setRetry(numberOfRetries)</key>Sets the number of retries to obtain a free object from the pool.</odoc>
			 */
			setRetry: function(numberOfRetries) { this.__retry = numberOfRetries; return this; },
			/**
			 * <odoc><key>ow.obj.pool.setTimeout(aTimeoutInMs)</key>Sets a timeout in ms between each retry to obtain a free object from the pool.</odoc>
			 */
			setTimeout: function(aTimeoutInMs) { this.__timeout = aTimeoutInMs;	return this; },
			/**
			 * <odoc><key>ow.obj.pool.setMin(aNumberOfInstances)</key>Sets the minimum number of object instances the pool should have. These
			 * will be created upon ow.obj.pool.start.</odoc>
			 */
			setMin: function(aNumberOfInstances) { this.__min = aNumberOfInstances;	return this; },
			/**
			 * <odoc><key>ow.obj.pool.setMax(aMaxNumberOfInstances)</key>Sets the maximum number of object instances the pool can have.</odoc>
			 */
			setMax: function(aMaxNumberOfInstances) { this.__max = aMaxNumberOfInstances; return this; },
			/**
			 * <odoc><key>ow.obj.pool.setIncrementsOf(aNumberOfInstances)</key>Sets the number of increments in object instances on the pool in case that
			 * a new object instances is needed</odoc>
			 */
			setIncrementsOf: function(aNumberOfInstances) { this.__inc = aNumberOfInstances; return this;},
			
			__checkFree: function() {
				var isOk = false;
				var parent = this;
				var isThereRoom = false;

				syncFn(function() {
					if ((parent.__max > 0 && parent.__max <= (parent.__currentSize + 1)) && parent.__currentFree < 1) {
						isThereRoom = false;
					} else {
						isThereRoom = true;
					}
				}, this.__currentSize);

				if (!isThereRoom) {
					if (this.__retry >= 1) {
						for(var i = 0; i < this.__retry && isOk == false; i++) {
							sleep(this.__timeout);
							syncFn(function() {
								if (parent.__currentFree > 0 || (parent.__max > 0 && parent.__max > parent.__currentSize)) {
									isOk = true;
								}
							}, this.__currentSize);
						}
						if (isOk) return true;
					}
					throw "Pool is full with " + this.__currentSize + " objects";
				}

				return true;
			},
			
			__checkLimits: function() {
				if (this.__max <= 0) return true;

				var limitOk = false;
				var withinLimits = false;
				var parent = this;

				if (parent.__max > parent.__currentSize) {
					withinLimits = true;
				}

				if (withinLimits) limitOk = true;

				return limitOk;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.add(aObject, inUse)</key>
			 * Adds aObject to the current pool. Optionally you can indicate if it should be add has checkout (inUse = true).
			 * </odoc>
			 */
			add: function(aObject, inUse) {
				var parent = this;
				var res = false;

				syncFn(function() {
					if (parent.__checkLimits()) {
						if (parent.__max < 1 || parent.__currentSize <= parent.__max) {
							parent.__currentSize++;
							parent.__pool.push({
								"inUse": inUse,
								"obj": aObject
							});
							if (!inUse) parent.__currentFree++;
							res = true;
						}
					}
				}, this.__currentSize);

				return res;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setFactory(aFactoryFunction, aCloseFunction, aKeepaliveFunction)</key>
			 * Sets the functions to use to create new object instances with a aFactoryFunction (this function should return a
			 * new object instance each time is called). aCloseFunction to be called whenever an object instances needs to be terminated.
			 * And an optionally aKeepaliveFunction, that receives a object instances as an argument, and should perform the necessary
			 * procedures to keep the object instance "alive" (think connections that timeout after not being used for a long time).
			 * </odoc>
			 */
			setFactory: function(aFactoryFunction, aCloseFunction, aKeepaliveFunction) {
				this.__factory = aFactoryFunction;
				this.__close = aCloseFunction;
				this.__keepalive = function(obj) {
					try {
						aKeepaliveFunction(obj);
						return true;
					} catch(e) {
						return false;
					}
				};
				var parent = this;

				addOnOpenAFShutdown(function() {
					parent.stop();
				});
				
				return this;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setKeepalive(aTimeInSeconds)</key>
			 * Sets the aTimeInSeconds for the keep alive function to be called for all object instances in the pool. After setting
			 * to aTimeInSeconds > 0 the keep alive cycle will be started. Otherwise any existing keep alive cycle will be stopped.
			 * Note: don't forget to use ow.obj.pool.stop to keep the keep alive thread from running after you no longer need it.
			 * </odoc>
			 */
			setKeepalive: function(aTime) { 
				return this.setKeepaliveInMs(aTime * 1000);
			},

			/**
			 * <odoc>
			 * <key>ow.obj.pool.setKeepaliveInMs(aTimeInMs)</key>
			 * Sets the aTimeInMs for the keep alive function to be called for all object instances in the pool. After setting
			 * to aTimeInMs > 0 the keep alive cycle will be started. Otherwise any existing keep alive cycle will be stopped.
			 * Note: don't forget to use ow.obj.pool.stop to keep the keep alive thread from running after you no longer need it.
			 * </odoc>
			 */
			setKeepaliveInMs: function(aTime) {
				this.__keepaliveTime = aTime;
				var parent = this;
				if (aTime > 0) {
					plugin("Threads");
					if (isDef(this.__keepaliveThread)) { this.__keepaliveThread.stop(true); }
					this.__keepaliveThread = new Threads();
					this.__keepaliveThread.addThread(function() {
						try {
							for(var i in parent.__pool) {
								if (!parent.__pool[i].inUse) parent.__keepalive(parent.__pool[i].obj);
							}
						} catch(e) {
						}
					});
					this.__keepaliveThread.startWithFixedRate(aTime);
				} else {
					if (isDef(this.__keepaliveThread)) { this.__keepaliveThread.stop(true); }
				}
				return this; 
			},
			
			__createObj: function(inUse) {
				var parent = this;
				var obj;

				inUse = (isUnDef(inUse)) ? false : inUse;

				if (isDef(parent.__factory)) {
					obj = parent.__factory();
					if (parent.__inc > 1) {
						for(var i = 0; i < parent.__inc - 1; i++) {
							parent.add(parent.__factory());
						}
					}
					if (parent.add(obj, inUse))
						return obj;
					else
						return undefined;
				}

				return obj;
			},
			
			__getUnused: function(shouldTest) {	
				var obj = __;
				var i = 0, r = 0;
				var parent = this;

				syncFn(function() {
					while(isUnDef(obj) && i < parent.__currentSize) {
						var inUse = __;
						inUse = parent.__pool[i].inUse;
						if (inUse == false) {
							var useit = !shouldTest;						
							if (shouldTest) {
								useit = parent.__keepalive(parent.__pool[i].obj);
								if (!useit) parent.__cleanup(parent.__pool[i].obj);
							} 
							if (useit) {
								obj = parent.__pool[i].obj;
								parent.__pool[i].inUse = true;
								parent.__currentFree--;
							} else {
								r++;
								if (r <= parent.__retry) i = 0;
							}
						} else {
							i++;
						}
					}
				}, this.__currentSize);

				if (i >= parent.__currentSize) {
					var resCheckFree;
					resCheckFree = parent.__checkFree();
					syncFn(function() {
						if (resCheckFree && parent.__checkLimits()) {						
							obj = parent.__createObj(true);
						} 
					}, this.__currentSize);
					if (resCheckFree) {
						if (!isDef(obj)) {
							obj = parent.__getUnused(shouldTest);
						}
					}
				}

				return obj;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.start()</key>
			 * Starts the object pool by creating the minimal number of object instances.
			 * </odoc>
			 */
			start: function() {
				for(var i = 0; i < this.__min; i++) {
					this.__createObj();
				}
				
				return this;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.stop()</key>
			 * Stops the object pool closing all object instances and any keep alive cycle.
			 * </odoc>
			 */
			stop: function() {
				if (isDef(this.__keepaliveThread)) { this.__keepaliveThread.stop(true); }
				if (isDef(this.__close)) {
					for(var i in this.__pool) {
						// Tries to run close and ignores any error since is upon for delete
						try { this.__close(this.__pool[i].obj); } catch(e) {}
						delete this.__pool[i];
						this.__currentSize--;
					}
					this.__currentFree = 0;
					this.__currentSize = 0;
					this.__pool = [];
				}
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.checkOut() : Object</key>
			 * Tries to obtain an object instance from the pool and returns it marking it as in use. Throws an exception
			 * if no object is available even after retrying.
			 * </odoc>
			 */
			checkOut: function(shouldTest) {
				var obj, i = 0;
				var parent = this;

				obj = parent.__getUnused(shouldTest);

				if (isDef(obj))
					return obj;
				else
					throw "No available objects in pool.";
			},
			
			__cleanup: function(obj) {
				var parent = this;

				var i = 0;
				while(parent.__pool[i].obj != obj && i < parent.__pool.length) {
					i++;
				}
				if (i == parent.__pool.length) return;

				try { parent.__close(parent.__pool[i].obj) } catch (e) {}
				delete parent.__pool[i];
				parent.__currentSize--;
				loadLodash();
				parent.__pool = _.compact(parent.__pool);
				for(var i = parent.__currentSize; i < parent.__min; i++) {
					parent.__createObj();
				}
			},

			/**
			 * <odoc>
			 * <key>ow.obj.pool.checkIn(aObject, shouldKeep)</key>
			 * Returns the aObject instance back to the pool removing the mark that is in use. If shouldKeep = false the
			 * object instance will be removed from the pool (trying to call the closeFunction and ignoring any exception).
			 * </odoc>
			 */
			checkIn: function(obj, badObj) {
				var parent = this;
				syncFn(function() {
					var i;
					for(i = 0; i < parent.__currentSize && parent.__pool[i].obj != obj; i++) {}

					if (badObj == false) {
						// Tries to run close and ignores any error since is upon for delete
						parent.__cleanup(obj);
					} else {
						parent.__pool[i].inUse = false;
						parent.__currentFree++;
					}
				}, this.__currentSize);
				
				return this;
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.use(aFunction)</key>
			 * Executes aFunction providing, as an argument, an object instance from the pool (equivalent to ow.obj.pool.checkOut).
			 * After the execution the object instance will be returned to the pool (equivalent to ow.obj.pool.checkIn). If the aFunction
			 * returns false the provided object instance will be removed from the pool (interpreting as something is wrong 
			 * with it).
			 * </odoc>
			 */
			use: function(aFunction, doCheck) {
				// Get free objects
				var obj, i = 0;

				var parent = this;
				obj = this.checkOut(doCheck);

				// Got an object, use it
				if (isDef(obj)) {
					var res;

					try {
						var rf = aFunction(obj);
						if (isDef(rf)) res = rf; else res = true;
					} catch(e) {
						this.checkIn(obj, false);
						throw e;
					}

					this.checkIn(obj, res);
				} else {
					throw "No available objects in pool.";
				}
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setFactoryAF(anURL, aTimeout, aConnectionTimeout, dontUseTransaction)</key>
			 * Setups: a factory function to create an AF object using anURL and tries to send a Ping operation; a close
			 * function to close the AF object connection; a keep alive function that sends a Ping operation.
			 * </odoc>
			 */
			setFactoryAF: function(anURL, timeout, ctimeout, dontUseTransaction) {
				dontUseTransaction = _$(dontUseTransaction).default(false);
				ctimeout = _$(ctimeout).isNumber().default(timeout);

				this.setFactory(
					function() { var a = new AF(anURL, timeout, ctimeout, !dontUseTransaction); a.exec("Ping", {}); return a; },
					function(a) { a.close(); },
					function(a) { a.exec("Ping", {} )}
				);
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setFactoryRAIDDB(anAF, aConn, aKeepAlive, aURL, aPassword, useCIR, aDriver)</key>
			 * Setups: a factory function to create an DB object using anAF and aConn connection name from the RAID/WAF server;
			 * a close function to close the DB object connection; a keep alive function that tries to execute a select from dual
			 * (you can override this function providing aKeepAlive function that receives a database object as argument).
			 * </odoc>
			 */
			setFactoryRAIDDB: function(anAF, aConn, aKeepAlive, aURL, aPassword, useCIR, aDriver) {
				if (isUnDef(aKeepAlive)) {
					aKeepAlive = function(a) {
						if (a.getConnect().getMetaData().getDatabaseProductName().toLowerCase() == "postgresql") {
							a.q("select 1");
						} else {
							a.q("select 1 from dual");
						}
					};
				}
				
				this.setFactory(
					function() { var db = getRAIDDB(anAF, aConn, aURL, aPassword, useCIR, aDriver); return db; },
					function(a) { a.close(); },
					aKeepAlive
				);
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setFactoryDB(aDriver, aURL, aLogin, aPassword, aKeepAliveFunction, aTimeoutInMs)</key>
			 * Setups: a factory function to create an DB object using aDriver, aURL, aLogin and aPassword;
			 * a close function to close the DB object connection; a keep alive function that tries to execute a select from dual.
			 * </odoc>
			 */
			setFactoryDB: function(aDriver, aURL, aLogin, aPassword, aKeepAlive, aTimeout) {
				if (isUnDef(aKeepAlive)) {
					aKeepAlive = function(a) {
						if (a.getConnect().getMetaData().getDatabaseProductName().toLowerCase() == "postgresql") {
							a.q("select 1");
						} else {
							a.q("select 1 from dual");
						}
					}
				}
				
				this.setFactory(
					function() { var db = new DB(aDriver, aURL, aLogin, aPassword, aTimeout); return db; },
					function(a) { a.close(); },
					aKeepAlive
				);
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.pool.setFactorySSH(aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression)</key>
			 * Setups: a factory function to create an SSH object using aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression;
			 * a close function to close the SSH object connection; a keep alive function that tries to execute a command "true".
			 * </odoc>
			 */
			setFactorySSH: function(aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression) {
				this.setFactory(
					function() { plugin("SSH"); var ssh = new SSH(aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression); return ssh; },
					function(a) { a.close(); },
					function(a) { a.exec("true"); }
				);
			}
		}
		return res;
	},
	
	/**
	 * <odoc><key>ow.obj.pool.AF(url, timeout, conTimeout, dontUseTransaction)</key>Creates a pool setting with ow.obj.pool.setFactoryAF.</odoc>
	 */
	AF: function(anURL, aTimeout, aConnectionTimeout, dontUseTransaction) { var p = this.create(); p.setFactoryAF(anURL, aTimeout, aConnectionTimeout, dontUseTransaction); return p; },
	/**
	 * <odoc><key>ow.obj.pool.RAIDDB(aAF, con, keepAlive, url, pass, useCIR, driver)</key>Creates a pool setting with ow.obj.pool.setFactoryRAIDDB.</odoc>
	 */
	RAIDDB: function(anAF, aConn, aKeepAlive, aURL, aPassword, useCIR, aDriver) { var p = this.create(); p.setFactoryRAIDDB(anAF, aConn, aKeepAlive, aURL, aPassword, useCIR, aDriver); return p; },
	/**
	 * <odoc><key>ow.obj.pool.DB(driver, url, login, pass, keepAliveFn, timeout)</key>Creates a pool setting with ow.obj.pool.setFactoryDB.</odoc>
	 */
	DB: function(aDriver, aURL, aLogin, aPassword, aKeepAliveFunction, aTimeout) { var p = this.create(); p.setFactoryDB(aDriver, aURL, aLogin, aPassword, aKeepAliveFunction, aTimeout); return p; },
	/**
	 * <odoc><key>ow.obj.pool.SSH(host, port, login, pass, idkey, withCompression)</key>Creates a pool setting with ow.obj.pool.setFactorySSH.</odoc>
	 */
	SSH: function(aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression) { var p = this.create(); p.setFactorySSH(aHost, aPort, aLogin, aPass, anIdentificationKey, withCompression); return p; }
};

OpenWrap.obj.prototype.big = {
	/**
	 * <odoc>
	 * <key>ow.obj.big.create(shouldCompressKeys) : Object</key>
	 * Creates a "big" map object that compresses contents in memory. Optionally if shouldCompressKeys = true
	 * the key map will also be compressed. See also:\
	 * \
	 * ow.obj.big.set\
	 * ow.obj.big.setAll\
	 * ow.obj.big.get\
	 * ow.obj.big.find\
	 * \
	 * </odoc>
	 */
	create: function(shoudCompress) {
		var res = {
			internalData: {},
			internalIndex: {},
			threshold: getNumberOfCores() * 2048,
			compressKeys: shoudCompress,

			/**
			 * <odoc>
			 * <key>ow.obj.big.set(aKeyMap, aValueMap, aTimestamp)</key>
			 * Sets aValueMap associated with a aKeyMap. Optionally you can set the internal aTimestamp for the record.\
			 * Example:\
			 * \
			 * var big = ow.obj.big.create();\
			 * big.set({"name": "Anne"}, {"name": "Anne", "country": "USA", "company": "Wedo"});\
			 * \
			 * </odoc>
			 */
			set: function(aKeys, aColumns, aTime) {
				var hash = this.__genHash(aKeys);
				var existing = this.getID(aKeys, hash);
				var ett = (isUnDef(aTime)) ? nowUTC() : aTime;
			    var uuid;
			
			    if (Object.keys(aKeys) <= 0) return;
			    
				if(isDef(existing)) {
					uuid = existing;
				} else {
					uuid = genUUID();
				}
			
				this.internalData[uuid] = compress(aColumns);
			    if (isUnDef(this.internalIndex[hash])) { this.internalIndex[hash] = []; }
			
			    var k;
			    if (this.compressKeys) {
			    	k = compress(aKeys);
			    } else {
			    	k = aKeys;
			    }
			    
			    var notfound = true;
			    for (var i in this.internalIndex[hash]) {
			    	var et = this.internalIndex[hash][i];
			    	if (et.u == uuid) {
			    		notfound = false;
			    		et.t = ett;
			    		et.n = nowNano();
			    	}
			    }
			    
			    if(notfound) {
			    	this.internalIndex[hash].push({"u": uuid, "k": k, "t": ett, "n": nowNano() });
			    }
			    
			    return uuid;
			},
		
			/**
			 * <odoc>
			 * <key>ow.obj.big.remove(aKeyMap)</key>
			 * Removes aKeyMap and corresponding value.
			 * </odoc>
			 */
			remove: function(aKeys) {
				var existing = this.getID(aKeys);
				var uuid;
				var hash = this.__genHash(aKeys);
				
				if(isDef(existing)) {
					uuid = existing;
					
					delete this.internalData[uuid];
					delete this.internalIndex[hash];
				}
			}, 
			
			/**
			 * <odoc>
			 * <key>ow.obj.big.setAll(anArrayKeyNames, anArrayOfValues, aTimestamp)</key>
			 * Given anArrayOfValues will set them internally using the keys on anArrayKeyNames to define
			 * the corresponding keys. Optionally you can set the internal aTimestamp for the record.\
			 * \
			 * Example:\
			 * \
			 * var big = ow.obj.big.create();\
			 * var data = [\
			 * 		{"name": "Anne", "country": "USA", "company": "Wedo"},\
			 * 		{"name": "Rui", "country": "Portugal", "company": "Wedo"},\
			 * 		{"name": "Paulo", "country": "Portugal", "company": "Sonae"},\
			 * 		{"name": "Peter", "country": "USA", "company": "ACME"},\
			 * 		{"name": "Louis", "country": "USA", "company": "ACME"}\
			 * ];\
			 * big.setAll(["name", "country"], data);\
			 * \
			 * </odoc>
			 */
			setAll: function(anArrayKeyNames, anArray, aTimestamp) {
				var parent = this;

				var fn = function(aValue) {
					parent.set(ow.obj.filterKeys(anArrayKeyNames, aValue), aValue, aTimestamp);
					return aValue;
				};

				//if (this.threshold > this.internalIndex.length) {
					anArray.forEach(fn);
				//} else {
				//	parallel4Array(anArray, fn);
				//}
			},
		
			__genHash: function(aKeys) {
				var str = "";
				Object.keys(aKeys).sort().forEach((v, i, a) => {
					str += aKeys[v];
				});
				return sha1(str);
			},
		
			__getIndex: function() {
				return this.internalIndex;
			},
			
			__getData: function() {
				return this.internalData;
			},
			
			getIndex: function() {
				return this.__getIndex();
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.big.getSize() : Number</key>
			 * Returns the current number of keys available.
			 * </odoc>
			 */
			getSize: function() {
				return Object.keys(this.__getIndex()).length;
			},
			
			getByID: function(aId) {
				return this.__getIndex()[aId];
			},
			
			getID: function(aKeys, hash) {
				var keys = (isDef(hash) ? this.__getIndex()[hash] : this.__getIndex()[this.__genHash(aKeys)]);
				for(var i in keys) {
					if (this.compressKeys) {
						if (compare(uncompress(keys[i].k), aKeys)) {
							return keys[i].u;
						}
					} else {
						if (compare(keys[i].k, aKeys)) {
							return keys[i].u;
						}
					}
				}
				return __;
			},
		
			getColsByID: function(anId) {
				if (isUnDef(anId)) return __;
				return uncompress(this.__getData()[anId]);
			},
		
			getAllByIDs: function(anArrayOfIds) {
				var arr = [];
				var parent = this;
			
				var fn = function(aValue) {
					arr.push(parent.getColsByID(aValue));
					return aValue;
				};

				if (this.threshold > this.internalIndex.length) {
					anArrayOfIds.forEach(fn);
				} else {
					parallel4Array(anArrayOfIds, fn);
				}
			
				return arr;
			},
		
			__getCols: function(aKeys) {
				return this.getColsByID(this.getID(aKeys));
			},
			
			/**
			 * <odoc>
			 * <key>ow.obj.big.get(aKeyMap) : Map</key>
			 * Retrieves a value map given the provided aKeyMap.\
			 * Example:\
			 * \
			 * var big = ow.obj.big.create();\
			 * var data = [\
			 * 		{"name": "Anne", "country": "USA", "company": "Wedo"},\
			 * 		{"name": "Rui", "country": "Portugal", "company": "Wedo"},\
			 * 		{"name": "Paulo", "country": "Portugal", "company": "Sonae"},\
			 * 		{"name": "Peter", "country": "USA", "company": "ACME"},\
			 * 		{"name": "Louis", "country": "USA", "company": "ACME"}\
			 * ];\
			 * big.setAll(["name"], data);\
			 * big.get({"name": "Rui"}); // {"name": "Rui", "country": "Portugal", "company": "Wedo"}\
			 * \
			 * </odoc>
			 */
			get: function(aKeys) {
				return this.__getCols(aKeys);
			},
			
			findIDs: function(anArrayOfKeys) {
				var uuids = [];
				var parent = this;
			
				parallel4Array(anArrayOfKeys,
					function(aValue) {
						uuids.push(parent.getID(aValue));
					}
				);
			
				return uuids;
			},
		
			findByIDs: function(aFunction) {
				var uuids = [];
				var parent = this;
			
				var fn = function(aValue) {
					var keys = parent.__getIndex()[aValue];
					for(var i in keys) {
						var key;
						if (parent.compressKeys) key = uncompress(keys[i].k);
						else key = keys[i].k;
		
						if (aFunction(key)) {
							uuids.push(keys[i].u);
						}
					}
					return aValue;
				};

				if (this.threshold > this.internalIndex.length) {
					Object.keys(this.__getIndex()).forEach(fn);
				} else {
					parallel4Array(Object.keys(this.__getIndex()), fn);
				}
			
				return uuids;
			},
		
			/**
			 * <odoc>
			 * <key>ow.obj.big.find(aFunction) : Array</key>
			 * Will execute the provided aFunction providing each key available. For the keys where the function returns true the
			 * corresponding value will be gathered into the final resulting array.
			 * </odoc>
			 */
			find: function(aFunction) {
				var objs = [];
				var parent = this;
			
				var fn = function(aValue) {
					var keys = parent.__getIndex()[aValue];
					for(var i in keys) {
						var key;
						if (parent.compressKeys) key = uncompress(keys[i].k);
						else key = keys[i].k;
		
						if (aFunction(key)) {
							objs.push(parent.getColsByID(keys[i].u));
						}
					}
					
					return aValue;
				};

				
				if (this.threshold > this.internalIndex.length) {
					Object.keys(this.__getIndex()).forEach(fn);
				} else {
					parallel4Array(Object.keys(this.__getIndex()), fn);
				}
			
				return objs;
			}
		};
		return res;
	}
};

/**
 * <odoc>
 * <key>ow.obj.fromJson(aJson) : Object</key>
 * Creates an object or objects, using the aJson and the indication of the object prototypes to use. This is based on JMix from
 * https://github.com/khayll/jsmix.\
 * Example:\
 * \
 * var Point = function() {};\
 * Point.prototype.getX = function() { return this.x; }\
 * Point.prototype.getY = function() { return this.y; }\
 * \
 * ow.obj.fromJson({ x: 1, y: 2 }).withObject(Point.prototype).build().getX(); // 1\
 * \
 * var mylines = { "lines": [\
 *    { "name": "line 1", "points": [ { x: 0, y: 0}, { x: 5, y: 6} ] },\
 *    { "name": "line 2", "points": [ { x: -5, y: -5}, { x: 1, y: 3} ] },\
 * ]};\
 * \
 * var res = ow.obj.fromJson(mylines).withObject(Point.prototype, "lines.*.points.*").build();\
 * res.lines[1].points[1].getY(); // 3\
 * \
 * </odoc>
 * 
 * from https://github.com/khayll/jsmix
 */
OpenWrap.obj.prototype.fromJson = function(json) {
	var res = {
		data: {},
		create: function(someData) {
			if (!(someData instanceof Object)) {
				someData = jsonParse(someData);
			}
			
			this.data = someData || {};
			return this;
		},
		
		/**
		 * Method to map object prototype with a path in the data object
		 * @param {prototype} prototype of the object to be mapped onto the data
		 * @param {string} path to where the data objects are. Example: employees/*
		 */
		withObject: function(prototype, path) {
		    if ( this.emptyPath(path) ) {
		        this.data = this.mix(prototype, this.data);
		    } else {
		        this.data = this.mixRecursive(prototype, this.data, path.split('.'));
		    }
		    return this;
		},
		
		/**
		 * Returns the mixed object
		 */
		build: function() {
		    return this.data;
		},
		
		mixRecursive: function(prototype, parent, parts) {
		    var newParts = Array.from(parts);
		    var currentPart = newParts.shift();
		    if ( parts.length === 0 ) {
		        return this.mix(prototype, parent);
		    }
		    if ( isObject(parent[currentPart]) || currentPart === '*') {
		        if ( !isArray(parent[currentPart]) && currentPart !== '*' ) { 
		            parent[currentPart] = this.mixRecursive(prototype, parent[currentPart], newParts);
		        } else {
		            if ( currentPart === '*' ) {
		                for (var property in parent) {
		                    if (parent.hasOwnProperty(property)) {
		                        parent[property] = this.mixRecursive(prototype, parent[property], newParts);
		                    }
		                }
		            } else {
		                if ( newParts[0] === '*' ) {
		                    newParts.shift();
		                }
		                var parent2 = this; 
		                parent[currentPart].forEach( function (value, index) {
		                    parent[currentPart][index] = parent2.mixRecursive(prototype, parent[currentPart][index], newParts);
		                });
		            }
		        }
		    }
		    return parent;
		},
		
		mix: function(prototype, data) {
		    var target = Object.create(prototype);
		    for (var property in data) {
		        if (data.hasOwnProperty(property)) {
		            target[property] = data[property];
		        }
		    }
	
		    return target;
		},
		
		emptyPath: function(path) {
		    if ( path === undefined || path === '' ) {
		        return true;
		    }
		    return false;
		}
	}
	return res.create(json);
};

/**
 * <odoc>
 * <key>ow.obj.diff(aOriginalJSON, aFinalJSON, optionsMap) : String</key>
 * Produces a string representation with the difference between aOriginalJSON and aFinalJSON.\
 * If optionsMap.printColor = true it will be immediately print with ANSI colors if available.\
 * If optionsMap.justAnsi it won't print and just produce the ANSI color codes.\
 * If optionsMap.justChanges = true only the changed lines will be represented with the rest.\
 * If optionsMap.justDiff = true only the changed lines will be included.
 * </odoc>
 */
OpenWrap.obj.prototype.diff = function(aOrig, aFinal, optionsMap) {
	if (isUnDef(this.__diffColorFormat)) {
		this.__diffColorFormat = {
			addedJustChanges: "BOLD,BLACK",
			removed: "RED,BOLD",
			added: "GREEN,BOLD",
			removedJustChanges: "WHITE"
		};
	}

	loadDiff();
	var ar = JsDiff.diffJson(aOrig, aFinal); 

	if (isUnDef(optionsMap) || !(isObject(optionsMap))) optionsMap = { printColor: false, justChanges: false, justAnsi: false, justDiff: false };
	
	if (optionsMap.printColor) ansiStart();
	var s = "";
	for(var i in ar) {
		var color;
		if (optionsMap.printColor || optionsMap.justAnsi) {
		    color = (ar[i].added) ? (optionsMap.justChanges ? this.__diffColorFormat.addedJustChanges : this.__diffColorFormat.added) 
								  : (ar[i].removed && !optionsMap.justChanges) ? this.__diffColorFormat.removed 
													                           : this.__diffColorFormat.removedJustChanges;
		}

		var value = (ar[i].added) ? ar[i].value.replace(/(.*)\n/gm, " +$1\n")
								  : (ar[i].removed) ? (optionsMap.justChanges ? "" : ar[i].value.replace(/(.*)\n/gm, " -$1\n"))
													: ((optionsMap.justDiff) ? "" : ar[i].value.replace(/(.*)\n/gm, "  $1\n"));

		value = value.replace(/^([^ +-])/mg, "  $1");

		if (optionsMap.printColor || optionsMap.justAnsi) 
			s = s + String(ansiColor(color, value));
		else
			s = s + value;
	}
	if (optionsMap.printColor) { 
		print(s);
		ansiStop();
 	} else {
		return s; 
	}
};

/**
 * <odoc>
 * <key>ow.obj.setHTTPProxy(aHost, aPort, anArrayNonProxyHosts)</key>
 * Sets the current java HTTP proxy to aHost, aPort and optional sets anArrayNonProxyHosts (see more in https://docs.oracle.com/javase/8/docs/technotes/guides/net/proxies.html).
 * If no values are provided all http proxy settings, if any, are cleared out.
 * </odoc>
 */
OpenWrap.obj.prototype.setHTTPProxy = function(aHost, aPort, anArrayNonProxyHosts) {
	_$(aHost).isString("The host needs to be a string.");
	_$(anArrayNonProxyHosts).isArray("Array of non proxy hosts needs to be an array.");

	if (isUnDef(aHost) && isUnDef(aPort)) {
		java.lang.System.clearProperty("http.proxyHost");
		java.lang.System.clearProperty("http.proxyPort");
		java.lang.System.clearProperty("http.nonProxyHosts");
	} else {
		java.lang.System.setProperty("http.proxyHost", String(aHost));
		java.lang.System.setProperty("http.proxyPort", String(aPort));
		if (isDef(anArrayNonProxyHosts)) java.lang.System.setProperty("http.nonProxyHosts", anArrayNonProxyHosts.join("|"));
	}
};

/**
 * <odoc>
 * <key>ow.obj.setHTTPSProxy(aHost, aPort, anArrayNonProxyHosts)</key>
 * Sets the current java HTTPS proxy to aHost, aPort and optional sets anArrayNonProxyHosts (see more in https://docs.oracle.com/javase/8/docs/technotes/guides/net/proxies.html).
 * If no values are provided all https proxy settings, if any, are cleared out.
 * </odoc>
 */
OpenWrap.obj.prototype.setHTTPSProxy = function(aHost, aPort, anArrayNonProxyHosts) {
	_$(aHost).isString("The host needs to be a string.");
	_$(anArrayNonProxyHosts).isArray("Array of non proxy hosts needs to be an array.");

	if (isUnDef(aHost) && isUnDef(aPort)) {
		java.lang.System.clearProperty("https.proxyHost");
		java.lang.System.clearProperty("https.proxyPort");
		java.lang.System.clearProperty("http.nonProxyHosts");
	} else {
		java.lang.System.setProperty("https.proxyHost", String(aHost));
		java.lang.System.setProperty("https.proxyPort", String(aPort));
		if (isDef(anArrayNonProxyHosts)) java.lang.System.setProperty("http.nonProxyHosts", anArrayNonProxyHosts.join("|"));
	}
};

/**
 * <odoc>
 * <key>ow.obj.setFTPProxy(aHost, aPort, anArrayNonProxyHosts)</key>
 * Sets the current java FTP proxy to aHost, aPort and optional sets anArrayNonProxyHosts (see more in https://docs.oracle.com/javase/8/docs/technotes/guides/net/proxies.html).
 * If no values are provided all ftp proxy settings, if any, are cleared out.
 * </odoc>
 */
OpenWrap.obj.prototype.setFTPProxy = function(aHost, aPort, anArrayNonProxyHosts) {
	_$(aHost).isString("The host needs to be a string.");
	_$(anArrayNonProxyHosts).isArray("Array of non proxy hosts needs to be an array.");

	if (isUnDef(aHost) && isUnDef(aPort)) {
		java.lang.System.clearProperty("ftp.proxyHost");
		java.lang.System.clearProperty("ftp.proxyPort");
		java.lang.System.clearProperty("ftp.nonProxyHosts");
	} else {
		java.lang.System.setProperty("ftp.proxyHost", String(aHost));
		java.lang.System.setProperty("ftp.proxyPort", String(aPort));
		if (isDef(anArrayNonProxyHosts)) java.lang.System.setProperty("ftp.nonProxyHosts", anArrayNonProxyHosts.join("|"));
	}
};

/**
 * <odoc>
 * <key>ow.obj.setSOCKSProxy(aHost, aPort, aUser, aPass)</key>
 * Sets the current java SOCKS proxy to aHost, aPort and optional sets aUser and aPass (see more in https://docs.oracle.com/javase/8/docs/technotes/guides/net/proxies.html).
 * If no values are provided all scoks proxy settings, if any, are cleared out.
 * </odoc>
 */
OpenWrap.obj.prototype.setSOCKSProxy = function(aHost, aPort, aUser, aPass) {
	_$(aHost).isString("The host needs to be a string.");
	_$(aUser).isString();
	_$(aPass).isString();

	if (isUnDef(aHost) && isUnDef(aPort)) {
		java.lang.System.clearProperty("socksProxyHost");
		java.lang.System.clearProperty("socksProxyPort");
		java.lang.System.clearProperty("java.net.socks.username");
		java.lang.System.clearProperty("java.net.socks.password");
	} else {
		java.lang.System.setProperty("socksProxyHost", String(aHost));
		java.lang.System.setProperty("socksProxyPort", String(aPort));
		if (isDef(aUser) && isDef(aPass)) {
			java.lang.System.setProperty("java.net.socks.username", aUser);
			java.lang.System.setProperty("java.net.socks.password", aPass);
		}
	}	
};

OpenWrap.obj.prototype.httpSetDefaultTimeout = function(aTimeout) {
	this.__httpTimeout = aTimeout;
};

OpenWrap.obj.prototype.http = function(aURL, aRequestType, aIn, aRequestMap, isBytes, aTimeout, returnStream, options) {
	this.__lps = {}; 
	this.__config = {};
	this.__throwExceptions = true;
	this.__r = __;
	this.__rb = __; 
	this.__usv = true;
	this.__uf = __;
	this.__ufn = "file";
	this._stream = __;
	this._hpolicy = __;
	options = _$(options).isMap(options).default({});
	if (options.accessCookies) this.__cookies = new Packages.org.apache.hc.client5.http.impl.client.BasicCookieStore();
	if (options.accessCtx) this.__ctx = Packages.org.apache.hc.client5.http.client.protocol.HttpClientContext.create();
	if (options.force1) this._hpolicy = Packages.org.apache.hc.core5.http2.HttpVersionPolicy.FORCE_HTTP_1;
	if (options.force2) this._hpolicy = Packages.org.apache.hc.core5.http2.HttpVersionPolicy.FORCE_HTTP_2;
	if (options.forceNegotiate) this._hpolicy = Packages.org.apache.hc.core5.http2.HttpVersionPolicy.NEGOTIATE;
	//this.__h = new Packages.org.apache.hc.client5.http.impl.client.clients.createDefault();
	this._hcm = __;

	if (isDef(aURL)) {
		this.exec(aURL, aRequestType, aIn, aRequestMap, isBytes, aTimeout, returnStream);
	}
};

OpenWrap.obj.prototype.http.prototype.upload = function(aName, aFile) {
	this.__ufn = _$(aName, "aName").isString().default("file");
	_$(aFile, "aFile").isString().$_();

	this.__ufn = aName;
	this.__uf = aFile;
};

OpenWrap.obj.prototype.http.prototype.open = function(aTimeout) {
	// Setting ALPN to avoid warnings on java > 1.8
	if (!(String(java.lang.System.getProperty("java.version")).startsWith("1.8"))) {
		var tlsStrategy = Packages.org.apache.hc.client5.http.ssl.ClientTlsStrategyBuilder.create()
							.useSystemProperties()
							.setTlsDetailsFactory(new Packages.org.apache.hc.core5.function.Factory({
							create: (sslEngine) => {
								return new Packages.org.apache.hc.core5.reactor.ssl.TlsDetails(sslEngine.getSession(), sslEngine.getApplicationProtocol());
							}
							}))
							.build();
		this._hcm = Packages.org.apache.hc.client5.http.impl.nio.PoolingAsyncClientConnectionManagerBuilder.create()
							.setTlsStrategy(tlsStrategy)
							.build();			
	}

	var setTimeouts = () => {
		// Set timeout
		if (isDef(ow.obj.__httpTimeout) && isUnDef(aTimeout)) aTimeout = ow.obj.__httpTimeout;
		var rc = new Packages.org.apache.hc.client5.http.config.RequestConfig.custom();
		if (isDef(aTimeout)) {
			rc.setConnectionRequestTimeout(aTimeout);
			rc.setConnectTimeout(aTimeout);
		}
		//r.setConfig(rc.build());
		this.__h = this.__h.setDefaultRequestConfig(rc.build());
	}

	// Set credentials
	if (isDef(this.__l) && !(this.__forceBasic)) {
		var getKey;
		// If previous exist shut it down
		if (isDef(this.__h)) this.close();
		// Create new one
		this.__h = new Packages.org.apache.hc.client5.http.impl.async.HttpAsyncClients.custom();
		if (this.__usv) this.__h = this.__h.useSystemProperties();
		if (isDef(this._hpolicy)) {
			this.__h = this.__h.setVersionPolicy(this._hpolicy);
		} else {
			this.__h = this.__h.setVersionPolicy(Packages.org.apache.hc.core5.http2.HttpVersionPolicy.NEGOTIATE);
		}
		if (isDef(this._hcm)) {
			this.__h = this.__h.setConnectionManager(this._hcm);
		}
		for(var key in this.__lps) {
			if (aUrl.startsWith(key)) getKey = key;
		}
		setTimeouts();
		if (isDef(getKey)) {
			this.__h = this.__h.setDefaultCredentialsProvider(this.__lps[getKey]);
			this.__h = this.__handleConfig(this.__h);
			this.__h = this.__h.build();
		} else {
			this.__h = this.__handleConfig(this.__h);
			this.__h = this.__h.build();
		}
		return true;
	} else {
		if (isUnDef(this.__h) || (isDef(this.__h) && this.__h.status != "ACTIVE")) {
			// If previous exist shut it down
			if (isDef(this.__h)) this.close();
			// Create new one
			this.__h = new Packages.org.apache.hc.client5.http.impl.async.HttpAsyncClients.custom();
			if (this.__usv) this.__h = this.__h.useSystemProperties();
			if (isDef(this._hpolicy)) {
				this.__h = this.__h.setVersionPolicy(this._hpolicy);
			} else {
				this.__h = this.__h.setVersionPolicy(Packages.org.apache.hc.core5.http2.HttpVersionPolicy.NEGOTIATE);
			}
			if (isDef(this._hcm)) {
				this.__h = this.__h.setConnectionManager(this._hcm);
			}
			setTimeouts();
			this.__h = this.__handleConfig(this.__h);
			this.__h = this.__h.build();
			return true;
		}
	}

	return false;
};

OpenWrap.obj.prototype.http.prototype.close = function() {
	if (isDef(this.__h)) {
		this.__h.close(org.apache.hc.core5.io.CloseMode.GRACEFUL);
		this._hcm = __;
		return true;
	} else {
		return false;
	}
};

OpenWrap.obj.prototype.http.prototype.head = function(aURL, aIn, aRequestMap, isBytes, aTimeout) {
	this.exec(aURL, "HEAD", aIn, aRequestMap, isBytes, aTimeout);
	return this.responseHeaders();
};

OpenWrap.obj.prototype.http.prototype.setThrowExceptions = function(should) {
	this.__throwExceptions = should;
};

OpenWrap.obj.prototype.http.prototype.setConfig = function(aMap) {
	this.__config = aMap;
};

OpenWrap.obj.prototype.http.prototype.getCookieStore = function() {
	return this.__cookies;
};

OpenWrap.obj.prototype.http.prototype.__handleConfig = function(aH) {
	if (isDef(this.__config.disableCookie) && this.__config.disableCookie) aH = aH.disableCookieManagement();
	if (isDef(this.__config.disableRedirectHandling) && this.__config.disableRedirectHandling) aH = aH.disableRedirectHandling();
	if (isDef(this.__cookies)) aH = aH.setDefaultCookieStore(this.__cookies);
	return aH;
};

OpenWrap.obj.prototype.http.prototype.exec = function(aUrl, aRequestType, aIn, aRequestMap, isBytes, aTimeout, returnStream) {
	var r = __, canHaveIn = false, parent = this;

	if (isUnDef(aRequestType)) aRequestType = "GET";

	if (["POST", "PATCH", "PUT"].indexOf(aRequestType.toUpperCase()) >= 0) {
		canHaveIn = true; 
	}

	if (isDef(this.__uf)) {
		r = Packages.org.apache.hc.core5.http.nio.support.AsyncRequestBuilder.create(aRequestType.toUpperCase()).setUri(aUrl);
	} else {
		r = Packages.org.apache.hc.client5.http.async.methods.SimpleHttpRequest.create(aRequestType.toUpperCase(), aUrl);
	}

	this.open(aTimeout);

	r.addHeader("User-Agent", __OpenAFUserAgent);
	if (this.__forceBasic && isDef(this.__l)) {
		r.addHeader("Authorization", "Basic " + String(new java.lang.String(Packages.org.apache.commons.codec.binary.Base64.encodeBase64(new java.lang.String(Packages.openaf.AFCmdBase.afc.dIP(this.__l) + ":" + Packages.openaf.AFCmdBase.afc.dIP(this.__p)).getBytes()))));
	}

	if (isDef(aIn) && isString(aIn) && canHaveIn) {
		//r.setEntity(Packages.org.apache.hc.core5.http.io.entity.StringEntity(aIn));
		r.setBody(aIn, Packages.org.apache.hc.core5.http.ContentType.DEFAULT_TEXT);
		//r.setBody(new Packages.org.apache.hc.client5.http.entity.mime.InputStreamBody(af.fromString2InputStream(aIn), Packages.org.apache.hc.core5.http.ContentType.DEFAULT_TEXT));
	} else {
		if (isDef(this.__uf) && canHaveIn) {
			// If not active no entity will be sent (bug?)
			if (this.__h.status != "ACTIVE") { this.head(aUrl); }
			var entityBuilder = Packages.org.apache.hc.client5.http.entity.mime.MultipartEntityBuilder.create();
			
			var __hc = new Packages.openaf.HCUtils(), _f = __;
			if (isString(this.__uf)) {
				_f = new java.io.File(this.__uf);
				entityBuilder = entityBuilder.addBinaryBody(this.__ufn, _f, Packages.org.apache.hc.core5.http.ContentType.DEFAULT_BINARY, _f.getName());
			} else {
				entityBuilder = entityBuilder.addBinaryBody(this.__ufn, this.__uf);
			}
			var boundary = sha1(nowNano());
			entityBuilder.setBoundary(boundary);
			var mutiPartHttpEntity = entityBuilder.build();

			r.setEntity( __hc.getEntityProducer(mutiPartHttpEntity.getContent(), 8192, Packages.org.apache.hc.core5.http.ContentType.DEFAULT_BINARY) );
			//print(af.fromInputStream2String(mutiPartHttpEntity.getContent()));

			r.setHeader("Content-Type", Packages.org.apache.hc.core5.http.ContentType.MULTIPART_FORM_DATA + "; boundary=" + boundary);
			//r.setEntity(new org.apache.hc.core5.http.nio.entity.FileEntityProducer(new java.io.File(this.__uf)));
		}
	}

	for(var i in aRequestMap) {
		r.addHeader(i, aRequestMap[i]);
	}

	this.outputObj = {}, outObj = {};
	this.__c = r;
	
	var __f = __, __e = __, l_r = __;

	// Only start if not active	
	if (this.__h.status != "ACTIVE") this.__h.start();

	var futCB = __, stream = __;

	// Set callback
	futCB = new Packages.org.apache.hc.core5.concurrent.FutureCallback({
		completed: response => {
			//parent.__r = response;
			//l_r = response;
		},
		failed: exception => {
			__e = exception;
		},
		cancelled: () => {
			__e = new Error("Request cancelled.");
		}
	});

	// Handling returning a stream
	if (isUnDef(__f) && returnStream) {
		var __hc = new Packages.openaf.HCUtils();
		if (isDef(this.__ctx))
			__f = this.__h.execute(__hc.getStreamProducer(r), __hc.getStreamConsumer(), this.__ctx, futCB);
		else
			__f = this.__h.execute(__hc.getStreamProducer(r), __hc.getStreamConsumer(), futCB);

		// Wait for future
		__f.get();
		stream = __hc.getStream();
		this._stream = stream;
		l_r = __hc.getResponse();
		this.__r = l_r;

		if (!isNull(__hc.getException())) {
			throw __hc.getException();
		}
	}

	// Handling upload 
	if (isUnDef(__f) && isDef(this.__uf)) {
		var __hc = new Packages.openaf.HCUtils()
		if (isDef(this.__ctx))
			__f = this.__h.execute(r.build(), __hc.getConsumer(), this.__ctx, futCB);
		else
			__f = this.__h.execute(r.build(), __hc.getConsumer(), futCB);

		// Wait for future
		l_r = __f.get();
		this.__r = l_r;
	}

	// General handler
	if (isUnDef(__f)) {
		if (isDef(this.__ctx)) 
			__f = this.__h.execute(r, this.__ctx, futCB)
		else
			__f = this.__h.execute(r, futCB);

		// Wait for future
		l_r = __f.get(); 
		this.__r = l_r;
	}

	// Throw exception if found
	if (isDef(__e)) {
		this.close();
		throw __e;
	}

	if (isBytes && !returnStream) {
		outObj =  {
			responseCode: Number(l_r.getCode()),
			contentType: (isNull(l_r.getContentType())) ? "n/a" : String(l_r.getContentType().getMimeType()),
			responseBytes: l_r.getBodyBytes()
		};
	} else {
		if (returnStream) {
			outObj = stream;
		} else {
			outObj = {
				responseCode: Number(l_r.getCode()),
				contentType: (isNull(l_r.getContentType())) ? "n/a" : String(l_r.getContentType().getMimeType()),
				response: String(l_r.getBodyText())
			};
		}
	}
	this.outputObj = outObj;

	if (l_r.getCode() >= 400 && this.__throwExceptions) {
		switch(l_r.getCode()) {
		case 404: throw "FileNotFoundException " + aUrl + "; response = " + stringify(this.getErrorResponse());
		case 410: throw "FileNotFoundException " + aUrl + "; response = " + stringify(this.getErrorResponse());
		default: throw "IOException Server returned HTTP response code: " + l_r.getCode() + " for URL: " + aUrl + "; response = " + stringify(this.getErrorResponse(__, outObj));
		}
	}
	return this.outputObj;
};

OpenWrap.obj.prototype.http.prototype.get = function(aUrl, aIn, aRequestMap, isBytes, aTimeout, returnStream) {
	return this.exec(aUrl, "GET", aIn, aRequestMap, isBytes, aTimeout, returnStream);
};

OpenWrap.obj.prototype.http.prototype.getBytes = function(aUrl, aIn, aRequestMap, aTimeout) {
	return this.exec(aUrl, "GET", aIn, aRequestMap, true, aTimeout, false);
};

OpenWrap.obj.prototype.http.prototype.getStream = function(aUrl, aIn, aRequestMap, aTimeout) {
	return this.exec(aUrl, "GET", aIn, aRequestMap, false, aTimeout, true);
};

OpenWrap.obj.prototype.http.prototype.post = function(aUrl, aIn, aRequestMap, isBytes, aTimeout, returnStream) {
	return this.exec(aUrl, "POST", aIn, aRequestMap, isBytes, aTimeout, returnStream);
};

OpenWrap.obj.prototype.http.prototype.getErrorResponse = function(parseJson, aObj) {
	aObj = _$(aObj).default(this.outputObj);
	if (parseJson) {
		var res = aObj;
		if (isDef(res.response)) res.response = jsonParse(res.response);
		return res;	
	} else
		return aObj;
};

OpenWrap.obj.prototype.http.prototype.getResponse = function() {
	return this.outputObj;
};
	
OpenWrap.obj.prototype.http.prototype.login = function(aUser, aPassword, forceBasic, urlPartial) {
	if (isUnDef(urlPartial)) forceBasic = true;

	if (!forceBasic) {
		var url = new java.net.URL(urlPartial);
		var port = url.getPort();
		if (port < 0) {
			switch(url.getProtocol()) {
			case "http" : port = 80; break;
			case "https": port = 443; break;
			}
		}
		var as = new Packages.org.apache.hc.client5.http.auth.AuthScope(url.getHost(), port);
		var up = new Packages.org.apache.hc.client5.http.auth.UsernamePasswordCredentials(Packages.openaf.AFCmdBase.afc.dIP(aUser), new java.lang.String(Packages.openaf.AFCmdBase.afc.dIP(aPassword)).toCharArray());
		var cred = new org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider();
		cred.setCredentials(as, up);
		this.__lps[urlPartial] = cred;
	}

	this.__l = aUser;
	this.__p = aPassword;
	this.__forceBasic = forceBasic;
};

OpenWrap.obj.prototype.http.prototype.response = function() {
	//if (isDef(this.__r)) return this.__r;
	try {
		var res;
		res = String(this.__r.getBodyText());
		return res;
	} finally {
		//this.__r.close();
		//this.close();
	}
};

OpenWrap.obj.prototype.http.prototype.responseBytes = function() {
	//if (isDef(this.__rb)) return this.__rb;
	try {
		res = this.__r.getBodyBytes();
		return res;
	} finally {
		//this.__r.close();
		//this.close();
	}
};

OpenWrap.obj.prototype.http.prototype.responseCode = function() {
	return Number(this.__r.getCode());
};

OpenWrap.obj.prototype.http.prototype.responseHeaders = function(heads) {
	heads = _$(heads).default(this.__r.getHeaders());
	var ar = {};
	var hh = heads;
	for(var i in hh) {
		var name = hh[i].getName();
		if (isDef(ar[name]) && name.toLowerCase() == "set-cookie") {
			ar[name] = ar[name] + ";" + hh[i].getValue();
		} else {
			ar[hh[i].getName()] = hh[i].getValue();
		}
	}

	return ar;
};

OpenWrap.obj.prototype.http.prototype.responseStream = function() {
	return _stream;
};

OpenWrap.obj.prototype.http.prototype.responseType = function() {
	try {
		return String(this.__r.getContentType().getMimeType());
	} catch(e) {
		return "";
	}
};

OpenWrap.obj.prototype.rest = {

	connectionFactory: function() {
		return new ow.obj.http();
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.exceptionParse(anException) : Map</key>
	 * Tries to parse the response of a rest call exception and the response also if it's json.
	 * </odoc>
	 */
	exceptionParse: function(anException) {
		var er = jsonParse(String(anException).replace(/.+response =/, ""));
		if (isDef(er) && isDef(er.contentType) && er.contentType.toLowerCase().match(/application\/json/))
			er.response = jsonParse(er.response);
		return er;
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.getContentLength(aBaseURI, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP) : Number</key>
	 * Tries to get the content lenght for the given aBaseURI. Optionally you can provide aLogin, aPassword and/or aTimeout for the HTTP request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. 
	 * </odoc>
	 */
	getContentLength: function(aURL, _l, _p, _t, aRequestMap, __h) {
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();

		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
 		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
 		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
		}
		 
		try {
			h.exec(aURL, "HEAD", __, aRequestMap, __, _t);
			return Number(h.responseHeaders()["Content-Length"]) || Number(h.responseHeaders()["content-length"]);
		} catch(e) {
		   e.message = "Exception " + e.message + "; error = " + stringify(h.getErrorResponse(true));
		   throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.get(aBaseURI, aIndexMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP, retBytes) : String</key>
	 * Tries to obtain aIndexMap from the REST aBaseURI service returning as a string (uses the HTTP GET method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	get: function(aURL, aIdx, _l, _p, _t, aRequestMap, __h, retBytes) { 
		//plugin("HTTP");
		//var h = new HTTP();
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();
		
		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
 		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
 		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
 		
 		try {
 			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "GET", __, aRequestMap, retBytes, _t, retBytes);
 		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + stringify(h.getErrorResponse(true));
			throw e;
 		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonGet(aBaseURI, aIndexMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP, retBytes) : Map</key>
	 * Tries to obtain aIndexMap from the REST aBaseURI service returning as a map (uses the HTTP GET method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonGet: function(aURL, aIdx, _l, _p, _t, aRequestMap, __h, retBytes) {
		return jsonParse(this.get(aURL, aIdx, _l, _p, _t, aRequestMap, __h, retBytes).response);
	},
	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.create(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, urlEncode, aHTTP, retBytes) : String</key>
	 * Tries to create a new aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a string (uses the HTTP POST method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	create: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		//plugin("HTTP");
		//var h = new HTTP();
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();

		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		var rmap = (urlEncode) ?
				   merge({"Content-Type":"application/x-www-form-urlencoded"} , aRequestMap) :
				   merge({"Content-Type":"application/json; charset=utf-8"} , aRequestMap);

		try {
			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "POST", (isString(aDataRow) ? aDataRow : (urlEncode) ? ow.obj.rest.writeQuery(aDataRow) : af.toEncoding(stringify(aDataRow, __, ''), "cp1252", "UTF-8")), rmap, retBytes, _t, retBytes);
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.upload(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, urlEncode, aHTTP, retBytes, aMethod) : String</key>
	 * Tries to upload a new aDataRowMap entry (composed of name and in (a filename, a stream or an array of bytes)), identified by aIndexMap, on the REST aBaseURI service returning the reply as a string (uses the HTTP POST method or aMethod).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	upload: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes, aMethod) {
		aMethod = _$(aMethod, "aMethod").isString().default("POST");
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();

		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		/*var rmap = (urlEncode) ?
				   merge({"Content-Type":"application/x-www-form-urlencoded"} , aRequestMap) :
				   merge({"Content-Type":"application/json; charset=utf-8"} , aRequestMap);*/

		try {
			_$(aDataRow, "aDataRow").isMap().$_();
			_$(aDataRow.name, "aDataRow.name").isString().$_();
			_$(aDataRow.in, "aDataRow.in").$_();

			h.upload(aDataRow.name, aDataRow.in);
			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), aMethod, __, __, __, _t, retBytes);
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonUpload(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, urlEncode, aHTTP, retBytes, aMethod) : String</key>
	 * Tries to upload a new aDataRowMap entry (composed of name and in (a filename, a stream or an array of bytes)), identified by aIndexMap, on the REST aBaseURI service returning the reply as a map (uses the HTTP POST method or aMethod).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonUpload: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes, aMethod) {
		return jsonParse(af.toEncoding(this.upload(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes, aMethod).response, "cp1252"));
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonCreate(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, urlEncode, aHTTP, retBytes) : Map</key>
	 * Tries to create a new aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a map (uses the HTTP POST method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object.  If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonCreate: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		return jsonParse(af.toEncoding(this.create(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h).response, "cp1252"));
	},
	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.set(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, urlEncode, aHTTP, retBytes) : String</key>
	 * Tries to set aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a string (uses the HTTP PUT method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	set: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		//plugin("HTTP");
		//var h = new HTTP();
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();

		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		var rmap = (urlEncode) ?
		           merge({"Content-Type":"application/x-www-form-urlencoded"} , aRequestMap) :
				   merge({"Content-Type":"application/json; charset=utf-8"} , aRequestMap);
		
		try {
			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "PUT", (isString(aDataRow) ? aDataRow : (urlEncode) ? ow.obj.rest.writeQuery(aDataRow) : af.toEncoding(stringify(aDataRow, __, ''), "cp1252", "UTF-8")), rmap, retBytes, _t, retBytes);
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonSet(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, urlEncode, aHTTP, retBytes) : Map</key>
	 * Tries to set aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a map (uses the HTTP PUT method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonSet: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		return jsonParse(af.toEncoding(this.set(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h).response, "cp1252"));
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.patch(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, urlEncode, aHTTP, retBytes) : String</key>
	 * Tries to set aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a string (uses the HTTP PATCH method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	patch: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		//plugin("HTTP");
		//var h = new HTTP();
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();

		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		var rmap = (urlEncode) ?
		           merge({"Content-Type":"application/x-www-form-urlencoded"} , aRequestMap) :
				   merge({"Content-Type":"application/json; charset=utf-8"} , aRequestMap);
		
		try {
			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "PATCH", (isString(aDataRow) ? aDataRow : (urlEncode) ? ow.obj.rest.writeQuery(aDataRow) : af.toEncoding(stringify(aDataRow, __, ''), "cp1252", "UTF-8")), rmap, retBytes, _t, retBytes);
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonPatch(aBaseURI, aIndexMap, aDataRowMap, aLoginOrFunction, aPassword, aTimeout, urlEncode, aHTTP, retBytes) : Map</key>
	 * Tries to set aDataRowMap entry, identified by aIndexMap, on the REST aBaseURI service returning the reply as a map (uses the HTTP PATCH method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. If urlEncode=true the aDataRowMap will be converted into x-www-form-urlencoded instead of JSON.
	 * Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonPatch: function(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h, retBytes) {
		return jsonParse(af.toEncoding(this.patch(aURL, aIdx, aDataRow, _l, _p, _t, aRequestMap, urlEncode, __h).response, "cp1252"));
	},	
	/**
	 * <odoc>
	 * <key>ow.obj.rest.remove(aBaseURI, aIndexMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP, retBytes) : String</key>
	 * Tries to remove aIndexMap entry from the REST aBaseURI service returning the reply as a string (uses the HTTP DELETE method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	remove: function(aURL, aIdx, _l, _p, _t, aRequestMap, __h, retBytes) {
		//plugin("HTTP");
		//var h = new HTTP();
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();
				
		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		try {
			return h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "DELETE", __, aRequestMap, retBytes, _t, retBytes);
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	/**
	 * <odoc>
	 * <key>ow.obj.rest.jsonRemove(aBaseURI, aIndexMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP, retBytes) : Map</key>
	 * Tries to remove aIndexMap entry from the REST aBaseURI service returning the reply as a map (uses the HTTP DELETE method).
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object. Optionally if retBytes = true returns a java stream.
	 * </odoc>
	 */
	jsonRemove: function(aURL, aIdx, _l, _p, _t, aRequestMap, __h, retBytes) {
		return jsonParse(af.toEncoding(this.remove(aURL, aIdx, _l, _p, _t, aRequestMap, __h).response, "cp1252"));
	},
	/**
	 * <odoc>
	 * <key>ow.obj.rest.head(aBaseURI, aIndexMap, aLoginOrFunction, aPassword, aTimeout, aRequestMap, aHTTP) : Map</key>
	 * Tries to get the header map with aIndexMap entry from the REST aBaseURI service returning the reply as a Map.
	 * Optionally you can provide aLogin, aPassword and/or aTimeout for the REST request or use a function (aLoginOrFunction)
	 * that receives the HTTP object.
	 * </odoc>
	 */
	head: function(aURL, aIdx, _l, _p, _t, aRequestMap, urlEncode, __h) {
		var h = (isDef(__h)) ? __h : ow.obj.rest.connectionFactory();
				
		if (isUnDef(_l) && isUnDef(_p)) {
			var u = new java.net.URL(Packages.openaf.AFCmdBase.afc.fURL(aURL));
			if (u.getUserInfo() != null) {
				_l = String(java.net.URLDecoder.decode(u.getUserInfo().substring(0, u.getUserInfo().indexOf(":")), "UTF-8"));
				_p = String(java.net.URLDecoder.decode(u.getUserInfo().substring(u.getUserInfo().indexOf(":") + 1), "UTF-8"));
			}
		}
		
		if (isDef(_l) && isDef(_p)) {
			h.login(_l, _p, false, aURL);
		} 
		
 		if (isDef(_l) && isFunction(_l)) {
 			_l(h);
 		}
		
		try {
			var res = h.exec(aURL + ow.obj.rest.writeIndexes(aIdx), "HEAD", __, aRequestMap, __, _t, __);
			res.contentType = "application/json";
			res.response = h.responseHeaders();
			return res;
		} catch(e) {
			e.message = "Exception " + e.message + "; error = " + String(h.getErrorResponse(true));
			throw e;
		} finally {
			if (isUnDef(__h)) h.close();
		}
	},
	/**
	 * <odoc>
	 * <key>ow.obj.rest.writeIndexes(aPropsMap) : String</key>
	 * Given a map of REST API indexes (aPropsMap) will return a corresponding URI.
	 * </odoc>
	 */
	writeIndexes: function(aPropsObj) {
		var surl = "";
		
		for (var parName in aPropsObj) {
			var o = aPropsObj[parName];
			if (isObject(o)) o = JSON.stringify(o);
			surl += "/" + encodeURIComponent(parName) + "/" + encodeURIComponent(o);
		}
		
		return surl;
	},

	/**
	 * <odoc>
	 * <key>ow.obj.rest.writeQuery(aMap) : String</key>
	 * Given aMap will return a URL query string. Example:\
	 * "http://some.thing/other/stuff?" + ow.obj.rest.writeQuery({ a: 1, b: 2}));\
	 * \
	 * </odoc>
	 */
	writeQuery: function(aMap) {
		var str = [];
		if (isUnDef(aMap)) return "";

        for(var p in aMap)
            if (aMap.hasOwnProperty(p) && isDef(aMap[p])) {
            	str.push(encodeURIComponent(p) + "=" + encodeURIComponent(aMap[p]));
            }
        return str.join("&");
	}
};

OpenWrap.obj.prototype.pmSchema = {
	/**
	 * <odoc>
	 * <key>ow.obj.pmSchema.makeKey(aJavaPM) : String</key>
	 * Produces a key for the aJavaPM (a Java parameter map or Map) to identify the provided map in a pmSchema
	 * when using ow.obj.applySchema.
	 * </odoc>
	 */
	makeKey: function(javaPM) {
		if ((Object.prototype.toString.call(javaPM) != "[object JavaObject]")) 
			javaPM = af.toJavaParameterMap(javaPM);
		
		var keys = javaPM.getParameterNames();
		var k = [];
		while(keys.hasNext()) {
			var key = keys.next();
			k.push(key);
		}
		return k.sort().join(">-<");
	},
	
	sortMapKeys: function(someKeys) {
		for(var aKey in someKeys) {
			if (aKey.match(/\>\-\</)) {
				someKeys[aKey] = aKey.split(/\>\-\</).sort().join(">-<");
			}
		}
		return someKeys;
	},

	__buildSchemaFromJavaArrayList: function(javaAL) {
		var pmschema = {};
		var j = 0;

		var i = javaAL.iterator();
		while(i.hasNext()) {
			var pmvalue = i.next();
			var pmtype;
			if (pmvalue != null)
				pmtype = String(pmvalue.getClass()).replace(/.+\.([^\.]+)/, "$1");
			else
				pmtype = "Null";
			switch(pmtype) {
			case "ArrayList": pmschema = merge(pmschema, ow.obj.pmSchema.__buildSchemaFromJavaArrayList(pmvalue)); break;
			case "ParameterMap": 
				pmschema[ow.obj.pmSchema.makeKey(pmvalue)] = ow.obj.pmSchema.__buildSchemaFromJavaParameterMap(pmvalue); 
				break;
			}
		}

		return pmschema;
	},

    __applySchemaToJavaArrayList: function(javaAL, partSchema) {
    	ow.loadFormat();
		for(var i = 0; i < javaAL.size(); i++) {
			var pmvalue = javaAL.get(i);
			var pmtype;
			var sortedKeys;
			
			if (pmvalue != null)
				pmtype = String(pmvalue.getClass()).replace(/.+\.([^\.]+)/, "$1");
			else 
				pmtype = "Null";
			switch(pmtype) {
			case "ArrayList": 
				javaAL.set(i, ow.obj.pmSchema.__applySchemaToJavaArrayList(pmvalue, partSchema));
				break;
			case "ParameterMap": 
				if (isUnDef(sortedKeys)) sortedKeys = ow.obj.pmSchema.sortMapKeys(Object.keys(partSchema));
				javaAL.set(i, ow.obj.pmSchema.__applySchemaToJavaParameterMap(pmvalue, 
					partSchema[ow.format.string.closest(ow.obj.pmSchema.makeKey(pmvalue), sortedKeys)]));
				break;
			}
		}
	
		return javaAL;
	},

	__buildSchemaFromJavaParameterMap: function(javaPM) {
		var pmschema = {};
	
		var pms = javaPM.getParameterNames();
		while(pms.hasNext()) {
			var pm = pms.next();
			var pmvalue = javaPM.get(pm);
			var pmtype;
			if (pmvalue != null)
				pmtype = String(pmvalue.getClass()).replace(/.+\.([^\.]+)/, "$1");
			else
				pmtype = "Null";
			switch(pmtype) {
			case "ParameterMap": 
				pmschema[pm] = ow.obj.pmSchema.__buildSchemaFromJavaParameterMap(pmvalue); 
				break;
			case "ArrayList":
				pmschema[pm] = ow.obj.pmSchema.__buildSchemaFromJavaArrayList(pmvalue);
				break;
			default: pmschema[pm] = pmtype; break;
			}
		}
	
		return pmschema;
	},

	__applySchemaToJavaParameterMap: function(javaPM, partSchema) {
		var pms = javaPM.getParameterNames(); 

		while(pms.hasNext()) {
			var pm = pms.next();
			var pmvalue = javaPM.get(pm);
			var pmtype;
			
			if (pmvalue != null) 
				pmtype = String(pmvalue.getClass()).replace(/.+\.([^\.]+)/, "$1");
			else 
				pmtype = "Null";
			
			switch(pmtype) {
			case "ParameterMap":
				if (isDef(partSchema[pm]))
					javaPM.setParameter(pm, ow.obj.pmSchema.__applySchemaToJavaParameterMap(javaPM.getParameter(pm), partSchema[pm]));
				break;
			case "ArrayList":
				if (isDef(partSchema[pm]))
					javaPM.setArray(pm, ow.obj.pmSchema.__applySchemaToJavaArrayList(javaPM.getArray(pm), partSchema[pm]));
				break;
			default: 
				if (pmtype != partSchema[pm]) {
					switch(partSchema[pm]) {
					case "String": javaPM.setString(pm, pmvalue); break;
					case "Boolean": javaPM.setBoolean(pm, pmvalue); break;
					case "Double": javaPM.setDouble(pm, pmvalue); break;
					case "Long": javaPM.setLong(pm, pmvalue); break;
					case "Integer": javaPM.setInt(pm, pmvalue); break;
					case "DocumentFragmentImpl": javaPM.setXml(pm, pmvalue); break;
					case "Date": javaPM.setDate(pm, pmvalue); break;
					case "Null": javaPM.setNull(pm); break;
					case "Float": javaPM.setFloat(pm, pmvalue); break;
					}
				}
				break;
			}
		}
	
		return javaPM;
	},

	/**
	 * <odoc>
	 * <key>ow.obj.pmSchema.getSchema(aJavaPM) : Map</key>
	 * Builds a type schema from the provided aJavaPM (a Java Parameter Map) to be used with 
	 * ow.obj.pmSchema.toJavaParameterMap to enforce a schema of types. If aJavaPM is not a Java Parameter Map
	 * it will try to convert to one from a Map.
	 * </odoc>
	 */
	getSchema: function(javaPM) {
		if ((Object.prototype.toString.call(javaPM) != "[object JavaObject]")) 
			javaPM = af.toJavaParameterMap(javaPM);
		return ow.obj.pmSchema.__buildSchemaFromJavaParameterMap(javaPM);
	},

	/**
	 * <odoc>
	 * <key>ow.obj.pmSchema.applySchema(aJavaPM, aSchema) : JavaParameterMap</key>
	 * Given aSchema (produced by ow.obj.pmSchema.fromJavaParameterMap) and aJavaPM (a Java Parameter Map) it 
	 * corrects the types where needed (for example: enforce that a integer should really be a long). The corrected
	 * Java Parameter Map is returned. If aJavaPM is not a Java Parameter Map
	 * it will try to convert to Map and return an output Map instead of JavaParameterMap.
	 * </odoc>
	 */
	applySchema: function(javaPM, aSchema) {
		var isJava = true;
		if ((Object.prototype.toString.call(javaPM) != "[object JavaObject]")) {
			javaPM = af.toJavaParameterMap(javaPM);
			isJava = false;
		}
		if ((Object.prototype.toString.call(aSchema) == "[object JavaObject]")) 
			aSchema = af.fromJavaParameterMap(aSchema);
		
		var out = ow.obj.pmSchema.__applySchemaToJavaParameterMap(javaPM, aSchema);
		if (!isJava) out = af.fromJavaParameterMap(out);
		
		return out;
	}
};

/**
 * <odoc>
 * <key>ow.obj.getPath(aObject, aPath) : Object</key>
 * Given aObject it will try to parse the aPath a retrive the corresponding object under that path. Example:\
 * \
 * var a = { a : 1, b : { c: 2, d: [0, 1] } };\
 * \
 * print(ow.obj.getPath(a, "b.c")); // 2\
 * sprint(ow.obj.getPath(a, "b.d")); // [0, 1]\
 * print(ow.obj.getPath(a, "b.d[0]")); // 0\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.getPath = function(aObj, aPath) {
	// Moving to $$().get()
	if (!isObject(aObj)) return undefined;

	aPath = aPath.replace(/\[(\w+)\]/g, '.$1');
	aPath = aPath.replace(/^\./, '');       
	
    var a = aPath.split('.');
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in aObj) {
            aObj = aObj[k];
        } else {
            return;
        }
    }
    return aObj;
};

/**
 * <odoc>
 * <key>ow.obj.setPath(aObject, aPath, aNewValue) : Object</key>
 * Given aObject it will try to parse the aPath a set the corresponding object under that path to aNewValue. Example:\
 * \
 * var a = { a : 1, b : { c: 2, d: [0, 1] } };\
 * \
 * sprint(ow.obj.setPath(a, "b.c", 123); // { a : 1, b : { c: 123, d: [0, 1] } }\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.setPath = function(aObj, aPath, aValue) {
	// Moving to $$().set()

    if (!isObject(aObj)) return undefined;
    var orig = aObj;

	aPath = aPath.replace(/\[(\w+)\]/g, '.$1');
	aPath = aPath.replace(/^\./, '');       
	
    var a = aPath.split('.');
    var prev, prevK;
    for (var i = 0, n = a.length; i < n; ++i) {
		var k = a[i];
		prev = aObj;
		prevK = k;
        if (k in aObj) {
            aObj = aObj[k];
        } else {
			aObj[k] = {};
			aObj = aObj[k];
        }
    }
    prev[prevK] = aValue;
    return orig;
};

/**
 * <odoc>
 * <key>ow.obj.sign(aKey, aMap, aHashName, aHashFunction) : Map</key>
 * Given aMap and aKey will return a signed aMap using aHashFunction (defaults to sha512) with the hash algorithm indication
 * aHashName (defaults to 'sha512'). The signed aMap can later be verified with ow.obj.signVerify.
 * </odoc>
 */
OpenWrap.obj.prototype.sign = function(aKey, aMap, aHashName, aHashFunction) {
    _$(aKey, "aKey").$_();
    _$(aMap, "aMap").isMap().$_();
    aHashName = _$(aHashName, "aHashName").isString().default("sha512");
    aHashFunction = _$(aHashFunction, "aHashFunction").isFunction().default(sha512);

    ow.loadServer();
    if (isDef(aMap.__jwt)) delete aMap.__jwt;
    var hash = aHashName + "-" + aHashFunction(stringify(sortMapKeys(aMap), __, ""));
    var jwt = ow.server.jwt.sign(aKey, {
        subject: "openaf map signature",
        claims : {
            oaf: hash
        }
    });

    aMap.__jwt = jwt;
    return aMap;
};

/**
 * <odoc>
 * <key>ow.obj.isSigned(aMap) : boolean</key>
 * Verifies if the provided aMap was signed with ow.obj.sign function.
 * </odoc>
 */
OpenWrap.obj.prototype.isSigned = function(aMap) {
    if (isUnDef(aMap.__jwt)) return false;

    var jwt = aMap.__jwt;
    ow.loadServer();
    var djwt = ow.server.jwt.decode(jwt);
    if (isDef(djwt) && isDef(djwt.claims) && isDef(djwt.claims.oaf)) return true;

    return false;
};

/**
 * <odoc>
 * <key>ow.obj.signVerify(aKey, aMap) : boolean</key>
 * Verifies the signature of a signed aMap with ow.obj.sign function given aKey. Returns true if the signature is valid.
 * Supported hash functions of ow.obj.sign: sha512, sha384 and sha256.
 * </odoc>
 */
OpenWrap.obj.prototype.signVerify = function(aKey, aMap) {
    _$(aKey, "aKey").$_();
    _$(aMap, "aMap").isMap().$_();

    if (!ow.obj.isSigned(aMap)) throw "No openaf map signature found.";

    var jwt = ow.server.jwt.verify(aKey, aMap.__jwt);
    var [fn, hash] = jwt.claims.oaf.split("-");
    
    var v = clone(aMap);
    delete v.__jwt;

    switch(fn) {
    case "sha512": 
        var vhash = sha512(stringify(sortMapKeys(v), __, ""));
        if (vhash == hash) return true; else return false;
    case "sha384": 
        var vhash = sha384(stringify(sortMapKeys(v), __, ""));
        if (vhash == hash) return true; else return false;
    case "sha256": 
        var vhash = sha256(stringify(sortMapKeys(v), __, ""));
        if (vhash == hash) return true; else return false;
    default:
        throw "Hash algorithm not supported";
    }
};

/**
 * <odoc>
 * <key>ow.obj.syncArray(anArray) : ow.obj.syncArray</key>
 * Creates an instance of a thread-safe array/list. Optionally it can be initialized with anArray.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray = function(aArray) {
	var ja; 
	if (isDef(aArray) && isArray(aArray)) 
		ja = new java.util.ArrayList(aArray);
	else
		ja = new java.util.ArrayList();
		
	this.arr = java.util.Collections.synchronizedList(ja);
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.getJavaObject() : Object</key>
 * Returns the internal java object.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.getJavaObject = function() {
	return this.arr;
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.add(aObject) : boolean</key>
 * Adds aObject to the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.add = function(aObject) {
	return this.arr.add(aObject);
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.addAll(anArray)</key>
 * Concatenates anArray with the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.addAll = function(anArray) {
	_$(anArray, "array").isArray().$_();
	return this.arr.addAll(new java.util.ArrayList(anArray));
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.toArray() : Array</key>
 * Returns the internal array/list as a javascript array.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.toArray = function() {
	return af.fromJavaArray(this.arr.toArray());
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.length() : Number</key>
 * Returns the current size of the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.length = function() {
	return this.arr.size();
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.get(aIndex) : Object</key>
 * Returns the object on the internal array/list on position aIndex.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.get = function(aIdx) {
	return this.arr.get(aIdx);
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.remove(aIndex) : boolean</key>
 * Removes the element at aIndex from the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.remove = function(aIdx) {
	return this.arr.remove(aIdx);
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.set(aIndex, aObject) : Object</key>
 * Sets aObject overwriting the previous value at aIndex on the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.set = function(aIdx, aObject) {
	return this.arr.set(aIdx, aObject);
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.clear()</key>
 * Clears the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.clear = function() {
	this.arr.clear();
};

/**
 * <odoc>
 * <key>ow.obj.syncArray.indexOf(aObject) : Number</key>
 * Returns the position of aObject in the internal array/list.
 * </odoc>
 */
OpenWrap.obj.prototype.syncArray.prototype.indexOf = function(aObject) {
	return this.arr.indexOf(aObject);
};

/**
 * <odoc>
 * <key>ow.obj.schemaInit(aOptions)</key>
 * Internally initializes the Ajv library. That initialization will use the options refered in 
 * https://github.com/epoberezkin/ajv#options.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaInit = function(aOptions) {
	if (isUnDef(global.__ajv)) {
		aOptions = _$(aOptions).isMap().default({
			$data: true,
			$comment: true,
			useDefaults: true //,
			//coerceTypes: true
		});
		loadAjv();
		global.__ajv = new Ajv(aOptions);
	}
};

/**
 * <odoc>
 * <key>ow.obj.schemaCompile(aSchema) : Function</key>
 * Given a JSON aSchema returns a specific function to validate data over the provided aSchema.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaCompile = function(aSchema) {
	ow.obj.schemaInit();
	return global.__ajv.compile(aSchema);
};

/**
 * <odoc>
 * <key>ow.obj.schemaAdd(aKey, aSchema)</key>
 * Adds a JSON aSchema internally referring as aKey.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaAdd = function(aKey, aSchema) {
	ow.obj.schemaInit();
	global.__ajv.addSchema(aSchema, aKey);
};

/**
 * <odoc>
 * <key>ow.obj.schemaRemove(aKey)</key>
 * Removes a previsouly added JSON schema identified as aKey.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaRemove = function(aKey) {
	ow.obj.schemaInit();
	global.__ajv.removeSchema(aKey);
};

/**
 * <odoc>
 * <key>ow.obj.schemaCheck(aSchema) : Boolean</key>
 * Returns true/false if aSchema is a valid or not.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaCheck = function(aSchema) {
	ow.obj.schemaInit();
	return global.__ajv.validateSchema(aSchema);
};

/**
 * <odoc>
 * <key>ow.obj.schemaValidate(aSchema, aData, aErrorOptions) : boolean</key>
 * Using a JSON aSchema ill try to validate the provided aData. Optionally error options can be provided.
 * (check more in https://github.com/epoberezkin/ajv)
 * </odoc>
 */
OpenWrap.obj.prototype.schemaValidate = function(aSchema, aData, aErrorOptions) {
	aErrorOptions = _$(aErrorOptions).isMap().default({ dataVar: "args" });
	ow.obj.schemaInit();

	var val;
	if (isString(aSchema)) {
		val = global.__ajv.getSchema(aSchema);
	} else {
		val = ow.obj.schemaCompile(aSchema);
	}

	if (val(aData)) {
		return true;
	} else {
		throw global.__ajv.errorsText(val.errors, aErrorOptions);
	}
};

/**
 * <odoc>
 * <key>ow.obj.schemaGenerator(aJson, aId, aRequiredArray, aDescriptionTmpl) : Map</key>
 * Given aJson object it tries to return a generated base json-schema (http://json-schema.org/understanding-json-schema/index.html)
 * with an optional aId and optional descriptions based on aDescriptionTmpl (template) with the variables id, required, json, _detail (boolean
 * indicating whent the template is used for items), type, format and key. Some special notation:\
 *   - to indicate a regular expression just use a string starting and ending with a "/"\
 *   - to indicate a numeric range just use a "[" (inclusive) or a "]" (exclusive) to describe a numeric range (e.g "[2, 4[" )\
 *   - for enumeration use a "(" and a ")" on the beginning and end of a string representing an array of values (e.g. "([ 'red', 'blue', 'green' ])" )\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.schemaGenerator = function(aJson, aId, aRequired, aDescriptionTmpl) {
	aId       = _$(aId, "id").isString().default("https://example.com/schema.json");
	aRequired = _$(aRequired, "required").isArray().default([]);

	var aMap = {
		id       : aId,
		required : aRequired,
		json     : aJson,
		"_detail": false
	};

    var r = {
        "$id": aId,
		"$schema": "http://json-schema.org/draft-07/schema#",
		"description": (isDef(aDescriptionTmpl) ? templify(aDescriptionTmpl, aMap) : __),
		"required": aRequired
    };

	ow.loadFormat();

	aMap["_detail"] = true;
    var fn = function(j, ak) {
        var ms = {};

        if (isMap(j)) {
            ms.type = "object";
            var ks = Object.keys(j);
            ms.properties = {};
            for(var ii in ks) {
                ms.properties[ks[ii]] = fn(j[ks[ii]], ks[ii]);
            }
        }
        if (isArray(j)) {
            ms.type = "array";
            if (j.length > 0) ms.items = fn(j[0]);
		}
		if (isDate(j) || (isString(j) && !isNaN(new Date(j)))) {
			ms.type = "string";
			ms.format = "date-time";
			j = String(j);
		}
		if (isString(j) && ow.format.isURL(j)) {
			ms.type = "string";
			ms.format = "uri";
			j = String(j);
		}
        if (isString(j) && ow.format.isEmail(j)) {
			ms.type = "string";
			ms.format = "email";
			j = String(j);
		}
		if (isUnDef(ms.format) && ow.format.isIPv4(j)) {
			ms.type = "string";
			ms.format = "ipv4";
			j = String(j);
		}
		if (isUnDef(ms.format) && ow.format.isIPv6(j)) {
			ms.type = "string";
			ms.format = "ipv6";
			j = String(j);
		}
		if (isUnDef(ms.type)) {
			if (isString(j)) ms.type = "string";
			if (isBoolean(j)) ms.type = "boolean";
			if (isNumber(j)) ms.type = "number";
			if (isNull(j)) ms.type = "null";

			if (ms.type == "string" && j.match(/^\/.+\/$/)) {
				ms.pattern = j.replace(/^\/(.+)\//, "$1");
			}

			if (ms.type == "string" && j.match(/^[\[\]]\s*(\-?\s*[0-9]+)\s*,\s*(\-?\s*[0-9]+)\s*[\[\]]$/)) {
				var elems = j.match(/^([\[\]])\s*(\-?\s*[0-9]+)\s*,\s*(\-?\s*[0-9]+)\s*([\[\]])$/);
				if (elems[1] == "[") ms.minimum = elems[2];
				if (elems[1] == "]") ms.exclusiveMinimum = elems[2];
				if (elems[4] == "[") ms.exclusiveMaximum = elems[3];
				if (elems[4] == "]") ms.maximum = elems[3];
				ms.type = "number";
			}

			if (ms.type == "string" && j.match(/^[\[\]]\s*(\-?\s*[0-9]+)\s*/)) {
				var elems = j.match(/^([\[\]])\s*(\-?\s*[0-9]+)\s*/);
				if (elems[1] == "[") ms.minimum = elems[2];
				if (elems[1] == "]") ms.exclusiveMinimum = elems[2];
				ms.type = "number";
			}
			
			if (ms.type == "string" && j.match(/\s*(\-?\s*[0-9]+)\s*[\[\]]$/)) {
				var elems = j.match(/\s*(\-?\s*[0-9]+)\s*([\[\]])$/);
				if (elems[4] == "[") ms.exclusiveMaximum = elems[3];
				if (elems[4] == "]") ms.maximum = elems[3];
				ms.type = "number";
			}

			if (ms.type == "string" && j.match(/^\s*\(\s*\[(\s*.+\s*)\]\s*\)\s*$/)) {
				var oo = j.match(/^\s*\(\s*\[(\s*.+\s*)\]\s*\)\s*$/)[1].split(/\s*\,\s*/);
				if (isBoolean(oo[0])) ms.type = "boolean";
				if (isNumber(oo[0]))  ms.type = "number";
				if (isNull(oo[0]))    ms.type = "null";
				ms.enum = oo;
			}
		}

		if (isDef(aDescriptionTmpl)) {
			aMap.key = (isDef(ak) ? ak : __);
			ms.description = templify(aDescriptionTmpl, merge(ms, aMap));
		}

        return ms;
    };

	return merge(r, fn(aJson));
};

/**
 * <odoc>
 * <key>ow.obj.schemaSampleGenerator(aJsonSchema) : Map</key>
 * Tries to generate a sample JSON map based on the provided aJsonSchema. There is no guarantee
 * that the generated sample is valid.
 * </odoc>
 */
OpenWrap.obj.prototype.schemaSampleGenerator = function(aJsonSchema) {
	_$(aJsonSchema, "jsonSchema").isMap().$_();

	var fnE = j => {
		j.type = "string";
		return "([" + j.enum.join(", ") + "])";
	};

	var fn = j => {
		var r;
		if (isDef(j) && isDef(j.type)) {
			switch(j.type) {
			case "object":
				var r = {};
				var ks = Object.keys(j.properties);
				for(var ii in ks) {
					r[ks[ii]] = fn(j.properties[ks[ii]]);
				}
				break;
			case "number":
				if (isDef(j.enum)) {
					r = fnE(j);
				} else {
					if (isDef(j.minimum) || isDef(j.exclusiveMinimum)) {
						r = "";
						if (isDef(j.minimum))          r = "[ " + j.minimum; 
						if (isDef(j.exclusiveMinimum)) r = "] " + j.exclusiveMinimum;
	
						if (isDef(j.maximum) || isDef(j.exclusiveMaximum)) r += ", ";
					}
	
					if (isDef(j.maximum) || isDef(j.exclusiveMaximum)) {
						if (isUnDef(r)) r = "";
						if (isDef(j.maximum)) 
							r += j.maximum + " ]"; 
						else
							if (isDef(j.exclusiveMaximum)) 
								r += j.exclusiveMaximum + " [";
					}
	
					if (isUnDef(r)) r = 123;
				}
				break;
			case "array" :
				var v = fn(j.items);
				r = [ v, v, v ];
				break;
			case "boolean":
				r = true;
				break;
			case "null"  :
				if (isDef(j.enum)) {
					r = fnE(j);
				} else {
					r = null;
				}
				break;
			case "string":	
			default      :	
				if (isDef(j.enum)) {
					r = fnE(j);
				} else {
					if (isDef(j.format) && j.format == "date-time") {
						r = "1234-12-23T12:34:56.789Z";
					}

					if (isDef(j.format) && j.format == "email") {
						r = "someone@some.where";
					}

					if (isDef(j.format) && j.format == "hostname") {
						r = "ahost.some.where";
					}

					if (isDef(j.format) && j.format == "ipv4") {
						r = "1.2.3.4";
					}

					if (isDef(j.format) && j.format == "ipv6") {
						r = "1234:5678:90ab:cdef:1234:5678:90ab:cdef";
					}

					if (isDef(j.format) && j.format == "uri") {
						r = "http://something.some.where/in/there";
					}

					if (isDef(j.pattern)) r = "/" + j.pattern + "/";
					
					if (isUnDef(r))	r = "abc123";		
				}
			}
		}
		return r;
	};

	return fn(aJsonSchema);
};

/**
 * <odoc>
 * <key>ow.obj.oneOf(anArray, aWeightField) : Object</key>
 * Chooses a random object from the provided anArray. If aWeightField is provided that field should be 
 * present in each object of anArray and it will be used to "weight" the probability of that element being choosen randomly.
 * </odoc>
 */
OpenWrap.obj.prototype.oneOf = function(anArray, aWeightField) {
    var max = anArray.length;
    if (isDef(aWeightField)) {
        var rWeight = ow.obj.randomRange(0, $path(anArray, "sum([]." + aWeightField + ")"));
        for(var ii in anArray) {
            rWeight = rWeight - anArray[ii][aWeightField];
            if (rWeight <= 0) return anArray[ii];
        }
    } else {
        return anArray[ow.obj.randomRange(0, max-1)];
    }
};

/**
 * <odoc>
 * <key>ow.obj.oneOfFn(anArrayFn, aWeightField) : Object</key>
 * Equivalent to ow.obj.oneOf but each object is expected to have a field "fn" which should be a function. A random 
 * object will be choosen and the corresponding function (fn) will be called. If aWeightField is provided that field should be 
 * present in each object of anArray and it will be used to "weight" the probability of that element being choosen randomly.
 * </odoc>
 */
OpenWrap.obj.prototype.oneOfFn = function(anArrayFn, aWeightField) {
    var o;
    if (isDef(aWeightField)) {
        o = this.oneOf(anArrayFn, aWeightField);
    } else {
        o = this.oneOf(anArrayFn);
    }

    if (isObject(o) && isFunction(o.fn)) return o.fn();
    if (isFunction(o)) return o();

    return __;
};

/**
 * <odoc>
 * <key>ow.obj.randomRange(min, max) : Number</key>
 * Generates a random long number between min and max.
 * </odoc>
 */
OpenWrap.obj.prototype.randomRange = function(min, max) {
    return Math.floor((Math.random() * (max+1-min)) + min);
};

/**
 * <odoc>
 * <key>ow.obj.randomDateRange(aFormat, aMin, aMax) : Date</key>
 * Generates a random date between aMin date string and aMax date string which the corresponding format is determined
 * by aFormat. For example:\
 * \
 * randomDateRange("yyyyMMdd hhmm", "19991231 2300", "20000101 0200");\
 * \
 * </odoc>
 */
OpenWrap.obj.prototype.randomDateRange = function(aFormat, aMin, aMax) {
	ow.loadFormat();
    return new Date(ow.obj.randomRange(
        ow.format.toDate(aMin, aFormat).getTime(),
        ow.format.toDate(aMax, aFormat).getTime()
    ));
};

OpenWrap.obj.prototype.socket = {
	/**
	 * <odoc>
	 * <key>ow.obj.socket.string2string(aHostAddress, aPort, aInputString) : String</key>
	 * Tries to open a socket to aHostAddress on aPort sending aInputString. Will return the result, if any, as a string.
	 * </odoc>
	 */
	string2string: function(aHostAddress, aPort, aInputString) {
		var res;

		var cs = new java.net.Socket(aHostAddress, aPort); 
		var is = cs.getInputStream(); 
		var os = cs.getOutputStream(); 

		ioStreamWrite(os, aInputString); 
		res = af.fromInputStream2String(is);

		os.close();
		is.close();
		cs.close();

		return res;
	},
	/**
	 * <odoc>
	 * <key>ow.obj.socket.string2bytes(aHostAddress, aPort, aInputString) : Bytes</key>
	 * Tries to open a socket to aHostAddress on aPort sending aInputString. Will return the result, if any, as an array of bytes.
	 * </odoc>
	 */
	string2bytes: function(aHostAddress, aPort, aInputString) {
		var res;

		var cs = new java.net.Socket(aHostAddress, aPort); 
		var is = cs.getInputStream(); 
		var os = cs.getOutputStream(); 
		
		ioStreamWrite(os, aInputString); 
		res = af.fromInputStream2Bytes(is);

		os.close();
		is.close();
		cs.close();

		return res;
	}
};