import pandas as pd
import json
import os

file_name = 'excel/weapon.xlsx'

if not os.path.exists(file_name):
    print(f"错误: 找不到文件 {file_name}")
    exit()

try:
    df = pd.read_excel(file_name, dtype=str)
except Exception as e:
    print(f"读取 Excel 失败: {e}")
    exit()

df = df.fillna('')
weapons_list = []

def safe_int(val, default=0):
    try:
        return int(float(val))
    except:
        return default

def safe_float(val, default=0.0):
    try:
        return float(val)
    except:
        return default

for index, row in df.iterrows():
    if not row['ID'] or row['ID'].strip() == '':
        continue

    weapon_data = {
        "id": row['ID'].strip(),
        "name": row['中文名'].strip(),
        "type": row['种类'].strip(),
        "element": row['属性'].strip(),
        "category": row['武器分类'].strip(),
        "image": row['UI图标'].strip() if 'UI图标' in row else "",
        "stats": {
            "hp": safe_int(row.get('最大HP', 0)),
            "atk": safe_int(row.get('最大ATK', 0)),
            "max_level": safe_int(row.get('最大等级', 100), 100),
            "allow_extra": row.get('allow_extra', 'False').strip().lower() == 'true' if isinstance(row.get('allow_extra'), str) else bool(row.get('allow_extra', False)),
            "weapon_multiplier": safe_float(row.get('weapon_multiplier', 1.0), 1.0),
            "ca_fixed": safe_int(row.get('ca_fixed', 0), 0)
        },
        "skill_slots": []
    }

    for i in range(1, 6):
        skill_id_col = f'技能{i}_ID'
        unlock_col = f'技能{i}_解锁等级'

        if skill_id_col in df.columns:
            raw_val = str(row[skill_id_col]).strip()
            
            if raw_val != '':
                if ',' in raw_val:
                    options_list = [x.strip() for x in raw_val.replace('，', ',').split(',')]
                    
                    skill_entry = {
                        "is_slot": True,
                        "options": options_list,
                        "unlock_level": safe_int(row.get(unlock_col, 0), 0)
                    }
                else:
                    skill_entry = {
                        "is_slot": False,
                        "skill_id": raw_val,
                        "unlock_level": safe_int(row.get(unlock_col, 0), 0)
                    }
                
                weapon_data['skill_slots'].append(skill_entry)

    weapons_list.append(weapon_data)

with open('0215 copy/weapons.json', 'w', encoding='utf-8') as f:
    json.dump(weapons_list, f, ensure_ascii=False, indent=2)
print(f"转换成功！共转换 {len(weapons_list)} 把武器")
print("新增字段: allow_extra, weapon_multiplier, ca_fixed")
