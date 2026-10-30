// Generated from the reviewed component and token seeds. Run npm run ds:generate; do not edit.
function freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export const catalog = freeze([
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
  }
} as const);
