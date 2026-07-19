/* flower After Effects ExtendScript bridge. Keep this file ES3-compatible. */
var flower = (function () {
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
    return JSON.parse(payload);
  }

  function stringify(value) {
    if (typeof JSON !== "undefined" && JSON.stringify) return JSON.stringify(value);
    return '{"ok":false,"error":{"code":"FLOWER_JSON_UNAVAILABLE","message":"JSON.stringify is unavailable in this ExtendScript engine."}}';
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
    if (item instanceof AVItem) {
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
    item.parentFolder = ensureFlowerFolder();
    return item;
  }

  return {
    probe: function (_payload) {
      return wrap(function () {
        return {
          aeVersion: app.version,
          projectPath: projectPath(),
          itemCount: app.project.numItems,
          activeItem: itemSummary(app.project.activeItem),
          selection: selectedItems(),
          os: $.os
        };
      });
    },

    importLocalFileWithDialog: function (_payload) {
      return wrap(function () {
        var item = importFile(chooseFile("Select a local file to import into After Effects"));
        return { item: itemSummary(item) };
      });
    },

    writeFixtureMetadata: function (payload) {
      return wrap(function () {
        var data = parsePayload(payload);
        var item = data.itemId ? app.project.itemByID(Number(data.itemId)) : selectedFootage();
        if (!item) throw new Error("No target item found.");
        var before = item.comment || "";
        var metadata = {
          schemaVersion: 1,
          provider: "mitsubachi-flower",
          driveItemId: "fixture-drive-item",
          fileHash: "sha256:fixture"
        };
        item.comment = stringify(metadata);
        return { beforeComment: before, afterComment: item.comment, item: itemSummary(item) };
      });
    },

    replaceSelectedFootageWithDialog: function (_payload) {
      return wrap(function () {
        var item = selectedFootage();
        var before = itemSummary(item);
        item.replace(chooseFile("Select replacement footage"));
        var after = itemSummary(item);
        return {
          before: before,
          after: after,
          checksRequiringHumanVerification: [
            "Item.id maintained",
            "Item.comment maintained",
            "Composition layer references maintained",
            "Footage interpretation maintained",
            "Duration-change behavior",
            "Resolution-change behavior"
          ]
        };
      });
    },

    addSelectedFootageToActiveComp: function (_payload) {
      return wrap(function () {
        var item = selectedFootage();
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) {
          throw new Error("Active item is not a CompItem. Open or select a composition before adding footage.");
        }
        var layer = comp.layers.add(item);
        return {
          comp: itemSummary(comp),
          footage: itemSummary(item),
          layer: { index: layer.index, name: layer.name, id: safeValue(layer, "id") }
        };
      });
    }
  };
})();
