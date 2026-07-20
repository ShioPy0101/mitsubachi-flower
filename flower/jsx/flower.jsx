/* flower After Effects ExtendScript bridge. Keep this file ES3-compatible. */
var flower = (function () {
  var FLOWER_BEGIN = "[MITSUBACHI_FLOWER_BEGIN]";
  var FLOWER_END = "[MITSUBACHI_FLOWER_END]";
  var COMMENT_LIMIT_BYTES = 15999;

  function ok(data) {
    return stringify({ ok: true, data: data });
  }

  function fail(code, message) {
    return stringify({ ok: false, error: { code: code, message: String(message) } });
  }

  function wrap(fn) {
    try {
      return ok(fn());
    } catch (error) {
      return fail("FLOWER_AE_ERROR", error && error.message ? error.message : error);
    }
  }

  function parsePayload(payload) {
    if (!payload) return {};
    return parseJson(payload);
  }

  function parseJson(value) {
    if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(value);
    return eval("(" + value + ")");
  }

  function stringify(value) {
    if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(value);
    return stringifyFallback(value);
  }

  function stringifyFallback(value) {
    var type = typeof value;
    if (value === null) return "null";
    if (type === "string") return quoteJsonString(value);
    if (type === "number") return isFinite(value) ? String(value) : "null";
    if (type === "boolean") return value ? "true" : "false";
    if (value instanceof Array) {
      var items = [];
      for (var i = 0; i < value.length; i += 1) {
        var item = stringifyFallback(value[i]);
        items.push(item === undefined ? "null" : item);
      }
      return "[" + items.join(",") + "]";
    }
    if (type === "object") {
      var pairs = [];
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          var itemValue = stringifyFallback(value[key]);
          if (itemValue !== undefined) pairs.push(quoteJsonString(key) + ":" + itemValue);
        }
      }
      return "{" + pairs.join(",") + "}";
    }
    return undefined;
  }

  function quoteJsonString(value) {
    var result = "\"";
    for (var i = 0; i < value.length; i += 1) {
      var ch = value.charAt(i);
      var code = value.charCodeAt(i);
      if (ch === "\"") result += "\\\"";
      else if (ch === "\\") result += "\\\\";
      else if (ch === "\b") result += "\\b";
      else if (ch === "\f") result += "\\f";
      else if (ch === "\n") result += "\\n";
      else if (ch === "\r") result += "\\r";
      else if (ch === "\t") result += "\\t";
      else if (code < 32) result += "\\u" + ("0000" + code.toString(16)).slice(-4);
      else result += ch;
    }
    return result + "\"";
  }

  function projectPath() {
    return app.project.file ? app.project.file.fsName : null;
  }

  function itemSummary(item) {
    if (!item) return null;
    var data = {
      id: safeValue(item, "id"),
      name: safeValue(item, "name"),
      typeName: safeValue(item, "typeName"),
      comment: safeValue(item, "comment")
    };
    if (typeof AVItem !== "undefined" && item instanceof AVItem) {
      data.width = safeValue(item, "width");
      data.height = safeValue(item, "height");
      data.duration = safeValue(item, "duration");
      data.frameRate = safeValue(item, "frameRate");
      data.pixelAspect = safeValue(item, "pixelAspect");
    }
    if (item instanceof FootageItem && item.file) {
      data.filePath = item.file.fsName;
    }
    if (item.parentFolder) {
      data.parentFolder = item.parentFolder.name;
    }
    return data;
  }

  function safeValue(object, key) {
    try {
      return object[key];
    } catch (_error) {
      return null;
    }
  }

  function selectedItems() {
    var selection = app.project.selection;
    var items = [];
    for (var i = 0; i < selection.length; i += 1) {
      items.push(itemSummary(selection[i]));
    }
    return items;
  }

  function selectedFootage() {
    var selection = app.project.selection;
    if (!selection || selection.length !== 1 || !(selection[0] instanceof FootageItem)) {
      throw new Error("Select exactly one FootageItem in the Project panel.");
    }
    return selection[0];
  }

  function chooseFile(prompt) {
    var file = File.openDialog(prompt);
    if (!file) throw new Error("File selection was canceled.");
    return file;
  }

  function ensureFlowerFolder() {
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (item instanceof FolderItem && item.name === "flower") return item;
    }
    return app.project.items.addFolder("flower");
  }

  function importFile(file) {
    var options = new ImportOptions(file);
    var item = app.project.importFile(options);
    if (!(item instanceof FootageItem)) throw new Error("Imported item is not a FootageItem.");
    item.parentFolder = ensureFlowerFolder();
    return item;
  }

  function countFlowerBlocks(comment) {
    var count = 0;
    var offset = 0;
    while (true) {
      var start = comment.indexOf(FLOWER_BEGIN, offset);
      if (start < 0) break;
      var end = comment.indexOf(FLOWER_END, start + FLOWER_BEGIN.length);
      if (end < 0) throw new Error("Malformed flower metadata block.");
      count += 1;
      offset = end + FLOWER_END.length;
    }
    return count;
  }

  function upsertFlowerCommentBlock(comment, metadata) {
    comment = comment || "";
    var count = countFlowerBlocks(comment);
    if (count > 1) throw new Error("Multiple flower metadata blocks found.");
    var block = FLOWER_BEGIN + "\n" + stringify(metadata) + "\n" + FLOWER_END;
    var next;
    if (count === 1) {
      var start = comment.indexOf(FLOWER_BEGIN);
      var end = comment.indexOf(FLOWER_END) + FLOWER_END.length;
      var before = comment.substring(0, start).replace(/[ \t]*\r?\n?$/, "");
      next = before + (before ? "\n" : "") + block + comment.substring(end);
    } else {
      next = comment ? comment.replace(/\s*$/, "") + "\n" + block : block;
    }
    if (utf8Bytes(next) > COMMENT_LIMIT_BYTES) throw new Error("Flower metadata would exceed the After Effects comment limit.");
    return next;
  }

  function parseFlowerCommentBlock(comment) {
    comment = comment || "";
    var count = countFlowerBlocks(comment);
    if (count === 0) return null;
    if (count > 1) throw new Error("Multiple flower metadata blocks found.");
    var start = comment.indexOf(FLOWER_BEGIN) + FLOWER_BEGIN.length;
    var end = comment.indexOf(FLOWER_END);
    var metadata = parseJson(comment.substring(start, end).replace(/^\s+|\s+$/g, ""));
    if (!metadata || metadata.schema !== "mitsubachi.flower/v1") throw new Error("Malformed flower metadata block.");
    return metadata;
  }

  function utf8Bytes(value) {
    var bytes = 0;
    for (var i = 0; i < value.length; i += 1) {
      var code = value.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function scanFlowerMetadata() {
    var matches = [];
    for (var i = 1; i <= app.project.numItems; i += 1) {
      var item = app.project.item(i);
      if (item instanceof FootageItem) {
        try {
          var metadata = parseFlowerCommentBlock(item.comment || "");
          if (metadata) matches.push({ item: itemSummary(item), metadata: metadata });
        } catch (error) {
          matches.push({ item: itemSummary(item), error: error && error.message ? error.message : String(error) });
        }
      }
    }
    return matches;
  }

  return {
    probe: function (_payload) {
      return wrap(function () {
        return { aeVersion: app.version, projectPath: projectPath(), itemCount: app.project.numItems, activeItem: itemSummary(app.project.activeItem), selection: selectedItems(), os: $.os };
      });
    },

    importLocalFileWithDialog: function (_payload) {
      return wrap(function () {
        var item = importFile(chooseFile("Select a local file to import into After Effects"));
        return { item: itemSummary(item) };
      });
    },

    importCachedFile: function (payload) {
      return wrap(function () {
        var data = parsePayload(payload);
        if (!data.localCachePath) throw new Error("localCachePath is required.");
        var file = new File(data.localCachePath);
        if (!file.exists) throw new Error("Cached file does not exist.");
        if (!data.metadata || data.metadata.schema !== "mitsubachi.flower/v1") throw new Error("flower metadata is required.");
        app.beginUndoGroup("Import Mitsubachi flower footage");
        var item;
        try {
          item = importFile(file);
          item.comment = upsertFlowerCommentBlock(item.comment || "", data.metadata);
        } finally {
          app.endUndoGroup();
        }
        return { item: itemSummary(item), metadata: parseFlowerCommentBlock(item.comment || "") };
      });
    },

    scanProjectMetadata: function (_payload) {
      return wrap(function () {
        return { items: scanFlowerMetadata() };
      });
    },

    writeFixtureMetadata: function (payload) {
      return wrap(function () {
        var data = parsePayload(payload);
        var item = data.itemId ? app.project.itemByID(Number(data.itemId)) : selectedFootage();
        if (!item) throw new Error("No target item found.");
        var before = item.comment || "";
        var metadata = { schema: "mitsubachi.flower/v1", driveItemId: "fixture-drive-item", organizationId: "fixture-org", sha256: "sha256:fixture", serverUpdatedAt: "fixture", localCachePath: "fixture", lastSyncedAt: new Date().toISOString() };
        item.comment = upsertFlowerCommentBlock(before, metadata);
        return { beforeComment: before, afterComment: item.comment, item: itemSummary(item) };
      });
    },

    replaceSelectedFootageWithDialog: function (_payload) {
      return wrap(function () {
        var item = selectedFootage();
        var before = itemSummary(item);
        item.replace(chooseFile("Select replacement footage"));
        var after = itemSummary(item);
        return { before: before, after: after, checksRequiringHumanVerification: ["Item.id maintained", "Item.comment maintained", "Composition layer references maintained", "Footage interpretation maintained", "Duration-change behavior", "Resolution-change behavior"] };
      });
    },

    addSelectedFootageToActiveComp: function (_payload) {
      return wrap(function () {
        var item = selectedFootage();
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) throw new Error("Active item is not a CompItem. Open or select a composition before adding footage.");
        var layer = comp.layers.add(item);
        return { comp: itemSummary(comp), footage: itemSummary(item), layer: { index: layer.index, name: layer.name, id: safeValue(layer, "id") } };
      });
    }
  };
})();



