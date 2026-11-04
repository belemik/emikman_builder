// Generated from the reviewed component and token seeds. Run npm run ds:generate; do not edit.
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export const catalog = freeze([
  {
    "id": "tag-item",
    "label": "TagItem",
    "figma": {
      "componentSetNodeId": "195:1079",
      "exampleComponentNodeId": "195:1080",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": false,
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "m",
          "s",
          "xs"
        ],
        "default": "m"
      },
      "variant": {
        "type": "enum",
        "values": [
          "primary",
          "secondary"
        ],
        "default": "primary"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "error",
          "disabled"
        ],
        "default": "default"
      }
    },
    "editorProps": {
      "closable": {
        "type": "boolean",
        "default": true
      },
      "labelText": {
        "type": "text",
        "default": "Label"
      }
    },
    "verifiedVariants": [
      {
        "nodeId": "195:1080",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "disabled"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1084",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "disabled"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1088",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "default"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1093",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "error"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1098",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "hover"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1103",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "default"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1108",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "error"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1113",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "hover"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1118",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "default"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1123",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "error"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1128",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1133",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "default"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1138",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "error"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1143",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1148",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "disabled"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1153",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "disabled"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1158",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "disabled"
        },
        "width": 62,
        "height": 20
      },
      {
        "nodeId": "195:1163",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "disabled"
        },
        "width": 57,
        "height": 16
      },
      {
        "nodeId": "195:1168",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "default"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1172",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "error"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1176",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "hover"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1180",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "default"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1184",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "error"
        },
        "width": 73,
        "height": 28
      },
      {
        "nodeId": "195:1188",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 73,
        "height": 28
      }
    ]
  },
  {
    "id": "tag-input",
    "label": "TagInput",
    "figma": {
      "componentSetNodeId": "195:28347",
      "exampleComponentNodeId": "195:28348",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "m",
          "s",
          "xs"
        ],
        "default": "m"
      },
      "variant": {
        "type": "enum",
        "values": [
          "primary",
          "secondary"
        ],
        "default": "primary"
      }
    },
    "editorProps": {},
    "verifiedVariants": [
      {
        "nodeId": "195:28348",
        "props": {
          "size": "s",
          "variant": "primary"
        },
        "width": 69,
        "height": 20
      },
      {
        "nodeId": "195:28351",
        "props": {
          "size": "xs",
          "variant": "primary"
        },
        "width": 60,
        "height": 16
      },
      {
        "nodeId": "195:28354",
        "props": {
          "size": "s",
          "variant": "secondary"
        },
        "width": 69,
        "height": 20
      },
      {
        "nodeId": "195:28357",
        "props": {
          "size": "xs",
          "variant": "secondary"
        },
        "width": 60,
        "height": 16
      },
      {
        "nodeId": "195:28360",
        "props": {
          "size": "m",
          "variant": "primary"
        },
        "width": 83,
        "height": 28
      },
      {
        "nodeId": "195:28363",
        "props": {
          "size": "m",
          "variant": "secondary"
        },
        "width": 83,
        "height": 28
      }
    ]
  },
  {
    "id": "tag-more",
    "label": "TagMore",
    "figma": {
      "componentSetNodeId": "195:28366",
      "exampleComponentNodeId": "195:28367",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "m",
          "s",
          "xs"
        ],
        "default": "m"
      },
      "variant": {
        "type": "enum",
        "values": [
          "primary",
          "secondary"
        ],
        "default": "primary"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover"
        ],
        "default": "default"
      }
    },
    "editorProps": {},
    "verifiedVariants": [
      {
        "nodeId": "195:28367",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "default"
        },
        "width": 75,
        "height": 20
      },
      {
        "nodeId": "195:28371",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "default"
        },
        "width": 65,
        "height": 16
      },
      {
        "nodeId": "195:28375",
        "props": {
          "size": "s",
          "variant": "primary",
          "state": "hover"
        },
        "width": 75,
        "height": 20
      },
      {
        "nodeId": "195:28379",
        "props": {
          "size": "xs",
          "variant": "primary",
          "state": "hover"
        },
        "width": 65,
        "height": 16
      },
      {
        "nodeId": "195:28383",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "default"
        },
        "width": 75,
        "height": 20
      },
      {
        "nodeId": "195:28387",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "default"
        },
        "width": 65,
        "height": 16
      },
      {
        "nodeId": "195:28391",
        "props": {
          "size": "s",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 75,
        "height": 20
      },
      {
        "nodeId": "195:28395",
        "props": {
          "size": "xs",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 65,
        "height": 16
      },
      {
        "nodeId": "195:28399",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "default"
        },
        "width": 90,
        "height": 28
      },
      {
        "nodeId": "195:28403",
        "props": {
          "size": "m",
          "variant": "primary",
          "state": "hover"
        },
        "width": 90,
        "height": 28
      },
      {
        "nodeId": "195:28407",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "default"
        },
        "width": 90,
        "height": 28
      },
      {
        "nodeId": "195:28411",
        "props": {
          "size": "m",
          "variant": "secondary",
          "state": "hover"
        },
        "width": 90,
        "height": 28
      }
    ]
  },
  {
    "id": "tag-group",
    "label": "TagGroup",
    "figma": {
      "componentSetNodeId": "195:28415",
      "exampleComponentNodeId": "195:28416",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": false,
    "variantProps": {
      "amount": {
        "type": "enum",
        "values": [
          "1",
          "2"
        ],
        "default": "1"
      },
      "closable": {
        "type": "boolean",
        "default": true
      },
      "disabled": {
        "type": "boolean",
        "default": false
      },
      "size": {
        "type": "enum",
        "values": [
          "m"
        ],
        "default": "m"
      }
    },
    "editorProps": {},
    "verifiedVariants": [
      {
        "nodeId": "195:28416",
        "props": {
          "amount": "2",
          "closable": false,
          "disabled": false,
          "size": "m"
        },
        "width": 208,
        "height": 28
      },
      {
        "nodeId": "195:28420",
        "props": {
          "amount": "2",
          "closable": false,
          "disabled": true,
          "size": "m"
        },
        "width": 110,
        "height": 28
      },
      {
        "nodeId": "195:28423",
        "props": {
          "amount": "2",
          "closable": true,
          "disabled": false,
          "size": "m"
        },
        "width": 252,
        "height": 28
      },
      {
        "nodeId": "195:28427",
        "props": {
          "amount": "2",
          "closable": true,
          "disabled": true,
          "size": "m"
        },
        "width": 154,
        "height": 28
      },
      {
        "nodeId": "195:28430",
        "props": {
          "amount": "1",
          "closable": false,
          "disabled": false,
          "size": "m"
        },
        "width": 149,
        "height": 28
      },
      {
        "nodeId": "195:28433",
        "props": {
          "amount": "1",
          "closable": false,
          "disabled": true,
          "size": "m"
        },
        "width": 51,
        "height": 28
      },
      {
        "nodeId": "195:28435",
        "props": {
          "amount": "1",
          "closable": true,
          "disabled": false,
          "size": "m"
        },
        "width": 171,
        "height": 28
      },
      {
        "nodeId": "195:28438",
        "props": {
          "amount": "1",
          "closable": true,
          "disabled": true,
          "size": "m"
        },
        "width": 73,
        "height": 28
      }
    ]
  },
  {
    "id": "chip",
    "label": "Chip",
    "figma": {
      "componentSetNodeId": "75:1401",
      "exampleComponentNodeId": "75:1402",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": false,
    "variantProps": {
      "variant": {
        "type": "enum",
        "values": [
          "primary",
          "secondary"
        ],
        "default": "primary"
      },
      "selected": {
        "type": "boolean",
        "default": true
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "pressed",
          "disabled"
        ],
        "default": "default"
      },
      "icon": {
        "type": "boolean",
        "default": false
      }
    },
    "editorProps": {
      "counter": {
        "type": "boolean",
        "default": true
      },
      "labelText": {
        "type": "text",
        "default": "Chips"
      }
    },
    "verifiedVariants": [
      {
        "nodeId": "75:1402",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "disabled",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1407",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "disabled",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1412",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "disabled",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1418",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "disabled",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1424",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "disabled",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1429",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "disabled",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1434",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "disabled",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1440",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "disabled",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1446",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "default",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1451",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "hover",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1456",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "pressed",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1462",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "default",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1468",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "hover",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1474",
        "props": {
          "variant": "primary",
          "selected": true,
          "state": "pressed",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1481",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "default",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1486",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "hover",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1491",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "pressed",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1497",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "default",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1503",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "hover",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1509",
        "props": {
          "variant": "secondary",
          "selected": true,
          "state": "pressed",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1516",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "default",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1521",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "default",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1527",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "hover",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1532",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "hover",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1538",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "pressed",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1544",
        "props": {
          "variant": "primary",
          "selected": false,
          "state": "pressed",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1551",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "default",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1556",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "default",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1562",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "hover",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1567",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "hover",
          "icon": true
        },
        "width": 112,
        "height": 32
      },
      {
        "nodeId": "75:1573",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "pressed",
          "icon": false
        },
        "width": 90,
        "height": 32
      },
      {
        "nodeId": "75:1579",
        "props": {
          "variant": "secondary",
          "selected": false,
          "state": "pressed",
          "icon": true
        },
        "width": 112,
        "height": 32
      }
    ]
  },
  {
    "id": "hint",
    "label": "Elements / Hint Container",
    "figma": {
      "componentSetNodeId": "115:428",
      "exampleComponentNodeId": "115:429",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "hint": {
        "type": "boolean",
        "default": true
      },
      "counter": {
        "type": "boolean",
        "default": true
      }
    },
    "editorProps": {
      "hintText": {
        "type": "text",
        "default": "Hint"
      },
      "counterText": {
        "type": "text",
        "default": "10/25"
      }
    },
    "verifiedVariants": [
      {
        "nodeId": "115:429",
        "props": {
          "hint": true,
          "counter": true
        },
        "width": 280,
        "height": 14
      },
      {
        "nodeId": "115:432",
        "props": {
          "hint": false,
          "counter": true
        },
        "width": 280,
        "height": 14
      },
      {
        "nodeId": "115:434",
        "props": {
          "hint": true,
          "counter": false
        },
        "width": 280,
        "height": 14
      }
    ]
  },
  {
    "id": "field-label",
    "label": "Elements / Label",
    "figma": {
      "componentSetNodeId": "115:638",
      "exampleComponentNodeId": "115:646",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "hint": {
        "type": "enum",
        "values": [
          "Elements"
        ],
        "default": "Elements"
      },
      "counter": {
        "type": "enum",
        "values": [
          "Hint Container"
        ],
        "default": "Hint Container"
      },
      "Property 3": {
        "type": "enum",
        "values": [
          "Elements"
        ],
        "default": "Elements"
      },
      "Property 4": {
        "type": "enum",
        "values": [
          "Label"
        ],
        "default": "Label"
      }
    },
    "editorProps": {
      "necessarily": {
        "type": "boolean",
        "default": false
      }
    },
    "verifiedVariants": [
      {
        "nodeId": "115:646",
        "props": {
          "hint": "Elements",
          "counter": "Hint Container",
          "Property 3": "Elements",
          "Property 4": "Label"
        },
        "width": 30,
        "height": 14
      }
    ]
  },
  {
    "id": "dropdown-item",
    "label": "DropdownMenu",
    "figma": {
      "componentSetNodeId": "91:7219",
      "exampleComponentNodeId": "91:7220",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "type": {
        "type": "enum",
        "values": [
          "menu item",
          "group title",
          "group divider"
        ],
        "default": "menu item"
      },
      "size": {
        "type": "enum",
        "values": [
          "m",
          "s"
        ],
        "default": "m"
      },
      "selected": {
        "type": "boolean",
        "default": false
      },
      "hover": {
        "type": "boolean",
        "default": false
      },
      "disabled": {
        "type": "boolean",
        "default": false
      },
      "icon2": {
        "type": "boolean",
        "default": false
      }
    },
    "editorProps": {
      "itemText": {
        "type": "text",
        "default": "Item text"
      }
    },
    "verifiedVariants": [
      {
        "nodeId": "91:7220",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7229",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7240",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7249",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7260",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7269",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": false,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7280",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7289",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": false,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7300",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": true,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7309",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": true,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7320",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": true,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7329",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": true,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7340",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": true,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7349",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": true,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7360",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": true,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7369",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": true,
          "disabled": false,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7380",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": true,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7389",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": true,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7400",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": true,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7409",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": true,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7420",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": false,
          "disabled": true,
          "icon2": false
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7429",
        "props": {
          "type": "menu item",
          "size": "m",
          "selected": true,
          "hover": false,
          "disabled": true,
          "icon2": true
        },
        "width": 280,
        "height": 34
      },
      {
        "nodeId": "91:7440",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": false,
          "disabled": true,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7449",
        "props": {
          "type": "menu item",
          "size": "s",
          "selected": true,
          "hover": false,
          "disabled": true,
          "icon2": true
        },
        "width": 280,
        "height": 28
      },
      {
        "nodeId": "91:7460",
        "props": {
          "type": "group title",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 30
      },
      {
        "nodeId": "91:7462",
        "props": {
          "type": "group title",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 26
      },
      {
        "nodeId": "91:7464",
        "props": {
          "type": "group divider",
          "size": "m",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 17
      },
      {
        "nodeId": "91:7466",
        "props": {
          "type": "group divider",
          "size": "s",
          "selected": false,
          "hover": false,
          "disabled": false,
          "icon2": false
        },
        "width": 280,
        "height": 13
      }
    ]
  },
  {
    "id": "items-list",
    "label": "Elements / ItemsList",
    "figma": {
      "componentSetNodeId": "91:7468",
      "exampleComponentNodeId": "91:7469",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "internal": true,
    "variantProps": {
      "amount": {
        "type": "enum",
        "values": [
          "x1",
          "x2",
          "x3",
          "x4",
          "x5",
          "x6",
          "x7",
          "x8",
          "x9",
          "x10"
        ],
        "default": "x5"
      },
      "size": {
        "type": "enum",
        "values": [
          "m",
          "s"
        ],
        "default": "m"
      }
    },
    "editorProps": {},
    "verifiedVariants": [
      {
        "nodeId": "91:7469",
        "props": {
          "amount": "x1",
          "size": "m"
        },
        "width": 280,
        "height": 50
      },
      {
        "nodeId": "91:7472",
        "props": {
          "amount": "x1",
          "size": "s"
        },
        "width": 280,
        "height": 42
      },
      {
        "nodeId": "91:7475",
        "props": {
          "amount": "x2",
          "size": "m"
        },
        "width": 280,
        "height": 88
      },
      {
        "nodeId": "91:7479",
        "props": {
          "amount": "x2",
          "size": "s"
        },
        "width": 280,
        "height": 72
      },
      {
        "nodeId": "91:7483",
        "props": {
          "amount": "x3",
          "size": "m"
        },
        "width": 280,
        "height": 126
      },
      {
        "nodeId": "91:7488",
        "props": {
          "amount": "x3",
          "size": "s"
        },
        "width": 280,
        "height": 102
      },
      {
        "nodeId": "91:7493",
        "props": {
          "amount": "x4",
          "size": "m"
        },
        "width": 280,
        "height": 164
      },
      {
        "nodeId": "91:7499",
        "props": {
          "amount": "x4",
          "size": "s"
        },
        "width": 280,
        "height": 132
      },
      {
        "nodeId": "91:7505",
        "props": {
          "amount": "x5",
          "size": "m"
        },
        "width": 280,
        "height": 202
      },
      {
        "nodeId": "91:7512",
        "props": {
          "amount": "x5",
          "size": "s"
        },
        "width": 280,
        "height": 162
      },
      {
        "nodeId": "91:7519",
        "props": {
          "amount": "x6",
          "size": "m"
        },
        "width": 280,
        "height": 240
      },
      {
        "nodeId": "91:7527",
        "props": {
          "amount": "x6",
          "size": "s"
        },
        "width": 280,
        "height": 192
      },
      {
        "nodeId": "91:7535",
        "props": {
          "amount": "x7",
          "size": "m"
        },
        "width": 280,
        "height": 278
      },
      {
        "nodeId": "91:7544",
        "props": {
          "amount": "x7",
          "size": "s"
        },
        "width": 280,
        "height": 222
      },
      {
        "nodeId": "91:7553",
        "props": {
          "amount": "x8",
          "size": "m"
        },
        "width": 280,
        "height": 316
      },
      {
        "nodeId": "91:7563",
        "props": {
          "amount": "x8",
          "size": "s"
        },
        "width": 280,
        "height": 252
      },
      {
        "nodeId": "91:7573",
        "props": {
          "amount": "x9",
          "size": "m"
        },
        "width": 280,
        "height": 354
      },
      {
        "nodeId": "91:7584",
        "props": {
          "amount": "x9",
          "size": "s"
        },
        "width": 280,
        "height": 282
      },
      {
        "nodeId": "91:7595",
        "props": {
          "amount": "x10",
          "size": "m"
        },
        "width": 280,
        "height": 392
      },
      {
        "nodeId": "91:7607",
        "props": {
          "amount": "x10",
          "size": "s"
        },
        "width": 280,
        "height": 312
      }
    ]
  },
  {
    "id": "dropdown-menu",
    "label": "Elements / DropdownMenu",
    "figma": {
      "exampleComponentNodeId": "177:10720",
      "fileKey": "wiJYO9bWctpEiq2STFkNYU"
    },
    "variantProps": {},
    "editorProps": {},
    "verifiedVariants": [
      {
        "nodeId": "177:10720",
        "props": {},
        "width": 280,
        "height": 218
      }
    ]
  },
  {
    "id": "button",
    "label": "Button",
    "figma": {
      "pageNodeId": "0:1",
      "exampleComponentNodeId": "15:17377"
    },
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "s",
          "m",
          "l",
          "xl"
        ],
        "default": "m"
      },
      "variant": {
        "type": "enum",
        "values": [
          "primary",
          "secondary",
          "outline",
          "ghost"
        ],
        "default": "primary"
      },
      "colorScheme": {
        "type": "enum",
        "values": [
          "accent",
          "neutral"
        ],
        "default": "accent"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "pressed",
          "disabled"
        ],
        "default": "default",
        "note": "Для финального кода hover и pressed — интерактивные состояния, disabled — логическое свойство."
      }
    },
    "editorProps": {
      "label": {
        "type": "text",
        "default": "Продолжить",
        "note": "Редактируемый контент холста; не подтверждено как Figma component property."
      }
    },
    "verifiedTokenExamples": {
      "surface/primary/default": "#0055ff",
      "text/on-color/body": "#ffffff",
      "Font family/primary": "Manrope"
    }
  },
  {
    "id": "input",
    "label": "Input",
    "figma": {
      "pageNodeId": "112:2041",
      "exampleComponentNodeId": "115:71"
    },
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "s",
          "m",
          "l"
        ],
        "default": "l"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "pressed",
          "filled",
          "error",
          "disabled default",
          "disabled filled"
        ],
        "default": "default"
      },
      "placeholder": {
        "type": "boolean",
        "default": false,
        "note": "Это булев вариант, найденный в Figma, а не текст плейсхолдера."
      }
    },
    "editorProps": {
      "placeholderText": {
        "type": "text",
        "default": "Введите email"
      },
      "label": {
        "type": "text",
        "default": "Email",
        "note": "Редактируемый контент MVP; Figma component property не подтверждено."
      }
    },
    "verifiedTokenExamples": {
      "text/default/body": "#191f29",
      "surface/on-color/default": "#ffffff",
      "Font family/primary": "Manrope"
    }
  },
  {
    "id": "select",
    "label": "Select",
    "figma": {
      "pageNodeId": "195:56257",
      "exampleComponentNodeId": "195:56850"
    },
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "s",
          "m",
          "l"
        ],
        "default": "l"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "filled",
          "pressed",
          "error",
          "disabled filled",
          "disabled default"
        ],
        "default": "default"
      },
      "placeholder": {
        "type": "boolean",
        "default": true
      },
      "label": {
        "type": "boolean",
        "default": true
      },
      "foldDirection": {
        "type": "enum",
        "values": [
          "down",
          "up"
        ],
        "default": "down"
      }
    },
    "editorProps": {
      "labelText": {
        "type": "text",
        "default": "Страна",
        "note": "Контент MVP; не выдавать за component property Figma."
      },
      "placeholderText": {
        "type": "text",
        "default": "Выберите страну",
        "note": "Редактируемый контент, независимый от boolean placeholder."
      },
      "optionsText": {
        "type": "text",
        "default": "Россия\nБеларусь\nКазахстан",
        "note": "Данные для preview; строки через перевод строки."
      }
    },
    "verifiedTokenExamples": {
      "text/default/caption": "#69758d",
      "text/default/placeholder": "#b4bac6",
      "icon/neutral/default": "#445371",
      "surface/on-color/default": "#ffffff",
      "Font family/primary": "Manrope"
    }
  },
  {
    "id": "checkbox",
    "label": "Checkbox",
    "figma": {
      "pageNodeId": "50:320",
      "exampleComponentNodeId": "44:355"
    },
    "variantProps": {
      "size": {
        "type": "enum",
        "values": [
          "s",
          "xs"
        ],
        "default": "s"
      },
      "state": {
        "type": "enum",
        "values": [
          "default",
          "hover",
          "pressed",
          "disabled"
        ],
        "default": "default"
      },
      "checked": {
        "type": "boolean",
        "default": false
      },
      "indeterminate": {
        "type": "boolean",
        "default": false
      }
    },
    "editorProps": {
      "label": {
        "type": "text",
        "default": "Согласен с условиями",
        "note": "Контент редактора, не подтверждён как свойство компонента Figma."
      }
    },
    "verifiedTokenExamples": {
      "surface/on-color/default": "#ffffff",
      "border/neutral/overlay-strong": "#44537133",
      "text/default/body": "#191f29",
      "Font family/primary": "Manrope"
    }
  },
  {
    "id": "table",
    "label": "Table",
    "figma": {
      "pageNodeId": "2071:1101",
      "exampleFrameNodeId": "2073:10861",
      "cellComponentNodeId": "2071:3830"
    },
    "kind": "composite",
    "variantProps": {},
    "editorProps": {
      "title": {
        "type": "text",
        "default": "Типы топлива",
        "note": "Контент холста. Не Figma prop."
      }
    },
    "previewData": {
      "columns": [
        "Код",
        "Наименование",
        "Действие"
      ],
      "rows": [
        [
          "PETROL",
          "Бензин",
          "Изменить"
        ],
        [
          "DIESEL",
          "Дизель",
          "Изменить"
        ],
        [
          "ELECTRIC",
          "Электричество",
          "Изменить"
        ]
      ]
    },
    "childComponentMetadata": {
      "component": "table-cell",
      "variantProps": {
        "cell-type": {
          "values": [
            "cell-account",
            "cell-tag",
            "cell-price-up",
            "cell-price-down",
            "cell-users",
            "cell-btn",
            "cell-text",
            "progress-bar",
            "credit-card",
            "cell-btn-borderless",
            "cell-btn-icons",
            "cell-time",
            "cell-status",
            "header-cell"
          ]
        },
        "color": {
          "values": [
            "white",
            "blue"
          ]
        },
        "cell-divider": {
          "values": [
            "True",
            "False"
          ]
        }
      },
      "note": "Эти варианты подтверждены у table-cell, НЕ у корневого Table. Table — составной preview-паттерн."
    },
    "verifiedTokenExamples": {
      "surface/on-color/page": "#ffffff",
      "text/default/body": "#191f29",
      "surface/primary/subtle-medium": "#e6eeff",
      "text/primary/default": "#0055ff",
      "spacing/padding/spacing-16": 16,
      "spacing/radius/radius-4": 4,
      "Font family/primary": "Manrope"
    }
  }
] as const);
export const tokens = freeze({
  "surface/primary/default": {
    "type": "color",
    "value": "#0055ff",
    "verifiedAtNode": "15:17377"
  },
  "text/on-color/body": {
    "type": "color",
    "value": "#ffffff",
    "verifiedAtNode": "15:17377"
  },
  "text/default/body": {
    "type": "color",
    "value": "#191f29",
    "verifiedAtNode": "115:71"
  },
  "surface/on-color/default": {
    "type": "color",
    "value": "#ffffff",
    "verifiedAtNode": "115:71"
  },
  "text/default/caption": {
    "type": "color",
    "value": "#69758d",
    "verifiedAtNode": "195:56850"
  },
  "text/default/placeholder": {
    "type": "color",
    "value": "#b4bac6",
    "verifiedAtNode": "195:56850"
  },
  "icon/neutral/default": {
    "type": "color",
    "value": "#445371",
    "verifiedAtNode": "195:56850"
  },
  "border/neutral/overlay-strong": {
    "type": "color",
    "value": "#44537133",
    "verifiedAtNode": "195:56850"
  },
  "surface/on-color/page": {
    "type": "color",
    "value": "#ffffff",
    "verifiedAtNode": "2071:3830"
  },
  "surface/primary/subtle-medium": {
    "type": "color",
    "value": "#e6eeff",
    "verifiedAtNode": "2071:3830"
  },
  "text/primary/default": {
    "type": "color",
    "value": "#0055ff",
    "verifiedAtNode": "2071:3830"
  },
  "Font family/primary": {
    "type": "fontFamily",
    "value": "Manrope",
    "verifiedAtNode": "15:17377"
  },
  "Typography/Desktop/body/font-size/SM": {
    "type": "dimension",
    "value": 14,
    "verifiedAtNode": "115:71"
  },
  "Typography/Desktop/body/line-height/SM": {
    "type": "dimension",
    "value": 18,
    "verifiedAtNode": "115:71"
  },
  "Typography/Desktop/body/font-size/MD": {
    "type": "dimension",
    "value": 16,
    "verifiedAtNode": "44:355"
  },
  "Typography/Desktop/body/line-height/MD": {
    "type": "dimension",
    "value": 20,
    "verifiedAtNode": "44:355"
  },
  "spacing/padding/spacing-16": {
    "type": "dimension",
    "value": 16,
    "verifiedAtNode": "2073:10861"
  },
  "spacing/padding/spacing-24": {
    "type": "dimension",
    "value": 24,
    "verifiedAtNode": "2073:10861"
  },
  "spacing/gap/gap-8": {
    "type": "dimension",
    "value": 8,
    "verifiedAtNode": "2073:10861"
  },
  "spacing/radius/radius-4": {
    "type": "dimension",
    "value": 4,
    "verifiedAtNode": "2073:10861",
    "note": "Подтвержден радиус 4, но не глобальный радиус всех компонентов."
  },
  "surface/primary/hover": {
    "type": "color",
    "value": "#3377ff",
    "verifiedAtNode": "15:17429"
  },
  "surface/primary/pressed": {
    "type": "color",
    "value": "#0347d1",
    "verifiedAtNode": "15:17401"
  },
  "surface/disabled/overlay-light": {
    "type": "color",
    "value": "#4453710d",
    "verifiedAtNode": "15:17529"
  },
  "text/disabled/overlay-strong": {
    "type": "color",
    "value": "#44537180",
    "verifiedAtNode": "15:17529"
  },
  "surface/neutral/overlay-light": {
    "type": "color",
    "value": "#4453710d",
    "verifiedAtNode": "115:89"
  },
  "border/primary/hover": {
    "type": "color",
    "value": "#3377ff",
    "verifiedAtNode": "115:80"
  },
  "border/primary/pressed": {
    "type": "color",
    "value": "#0347d1",
    "verifiedAtNode": "115:125"
  },
  "border/error/default": {
    "type": "color",
    "value": "#f51743",
    "verifiedAtNode": "115:135"
  },
  "text/error/default": {
    "type": "color",
    "value": "#f51743",
    "verifiedAtNode": "115:135"
  },
  "Typography/Desktop/caption/font-size/2XS": {
    "type": "dimension",
    "value": 12,
    "verifiedAtNode": "15:17377"
  },
  "Typography/Desktop/caption/line-height/2XS": {
    "type": "dimension",
    "value": 14,
    "verifiedAtNode": "15:17377"
  },
  "icon/neutral/overlay-strong": {
    "type": "color",
    "value": "#44537133",
    "verifiedAtNode": "115:71"
  },
  "icon/disabled/overlay-strong": {
    "type": "color",
    "value": "#44537180",
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "icon/default/default": {
    "type": "color",
    "value": "#191f29",
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "icon/error/default": {
    "type": "color",
    "value": "#f51743",
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/error/overlay-light": {
    "type": "color",
    "value": "#f745690d",
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/neutral/overlay-medium": {
    "type": "color",
    "value": "#4453711a",
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "Typography/Desktop/caption/font-size/3XS": {
    "type": "number",
    "value": 10,
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "Typography/Desktop/caption/line-height/3XS": {
    "type": "number",
    "value": 12,
    "verifiedAtNode": "195:1079",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/disabled/overlay-medium": {
    "type": "color",
    "value": "#44537126",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "border/disabled/overlay-strong": {
    "type": "color",
    "value": "#44537180",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "text/primary/hover": {
    "type": "color",
    "value": "#3377ff",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "text/primary/pressed": {
    "type": "color",
    "value": "#0347d1",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "icon/on-color/default": {
    "type": "color",
    "value": "#ffffff",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "border/primary/default": {
    "type": "color",
    "value": "#0055ff",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/primary/overlay-light": {
    "type": "color",
    "value": "#0055ff0d",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/primary/overlay-medium": {
    "type": "color",
    "value": "#0055ff1a",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/primary/overlay-strong": {
    "type": "color",
    "value": "#0055ff26",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/neutral/overlay-strong": {
    "type": "color",
    "value": "#44537126",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/neutral/subtle-light": {
    "type": "color",
    "value": "#f5f6f8",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/neutral/subtle-medium": {
    "type": "color",
    "value": "#edeef1",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "surface/neutral/subtle-strong": {
    "type": "color",
    "value": "#dadde3",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "border/neutral/default": {
    "type": "color",
    "value": "#445371",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "border/neutral/hover": {
    "type": "color",
    "value": "#69758d",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "border/neutral/pressed": {
    "type": "color",
    "value": "#39455f",
    "verifiedAtNode": "75:1401",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "icon/primary/default": {
    "type": "color",
    "value": "#0055ff",
    "verifiedAtNode": "91:7219",
    "source": "Figma get_variable_defs Sprint 05"
  },
  "icon/primary/pressed": {
    "type": "color",
    "value": "#0347d1",
    "verifiedAtNode": "91:7219",
    "source": "Figma get_variable_defs Sprint 05"
  }
} as const);
