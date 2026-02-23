import pandas as pd
import json
import os

# 文件路径 - 从 excel 目录读取 weapon.xlsx，从 0215 copy 目录读取 weapons.json
json_file = '0215 copy/weapons.json'
excel_file = 'excel/weapon.xlsx'

if not os.path.exists(json_file):
    print(f"错误: 找不到文件 {json_file}")
    exit()

# 读取JSON
with open(json_file, 'r', encoding='utf-8') as f:
    weapons = json.load(f)

print(f"读取到 {len(weapons)} 把武器")

# 读取现有Excel以获取正确的列名
try:
    df_old = pd.read_excel(excel_file, dtype=str)
    columns = df_old.columns.tolist()
    print(f"Excel列名: {columns}")
except Exception as e:
    print(f"读取旧Excel失败: {e}")
    # 使用默认列名（不包含奥义cdr）
    columns = ['ID', '中文名', '种类', '属性', '武器分类', 'UI图标', 
               '最大HP', '最大ATK', '最大等级',
               'allow_extra', 'weapon_multiplier', 'ca_fixed',
               '技能1_ID', '技能1_解锁等级', '技能2_ID', '技能2_解锁等级',
               '技能3_ID', '技能3_解锁等级', '技能4_ID', '技能4_解锁等级',
               '技能5_ID', '技能5_解锁等级']

# 创建新的DataFrame
data = []
for weapon in weapons:
    row = {
        'ID': weapon.get('id', ''),
        '中文名': weapon.get('name', ''),
        '种类': weapon.get('type', ''),
        '属性': weapon.get('element', ''),
        '武器分类': weapon.get('category', ''),
        'UI图标': weapon.get('image', ''),
        '最大HP': weapon.get('stats', {}).get('hp', 0),
        '最大ATK': weapon.get('stats', {}).get('atk', 0),
        '最大等级': weapon.get('stats', {}).get('max_level', 100),
        # 新增字段
        'allow_extra': weapon.get('stats', {}).get('allow_extra', False),
        'weapon_multiplier': weapon.get('stats', {}).get('weapon_multiplier', 1.0),
        'ca_fixed': weapon.get('stats', {}).get('ca_fixed', 0),
    }
    
    # 处理技能槽位
    skill_slots = weapon.get('skill_slots', [])
    for i in range(5):
        if i < len(skill_slots):
            slot = skill_slots[i]
            if slot.get('is_slot', False):
                # 可选槽位，用逗号分隔
                row[f'技能{i+1}_ID'] = ','.join(slot.get('options', []))
            else:
                row[f'技能{i+1}_ID'] = slot.get('skill_id', '')
            row[f'技能{i+1}_解锁等级'] = slot.get('unlock_level', 0)
        else:
            row[f'技能{i+1}_ID'] = ''
            row[f'技能{i+1}_解锁等级'] = ''
    
    data.append(row)

df_new = pd.DataFrame(data)

# 移除奥义cdr列（如果存在）
if '奥义cdr' in df_new.columns:
    df_new = df_new.drop(columns=['奥义cdr'])

# 确保列顺序
df_new = df_new.reindex(columns=columns)

# 写入Excel
df_new.to_excel(excel_file, index=False)
print(f"同步成功！已写入 {len(df_new)} 把武器到 {excel_file}")
print("新增字段: allow_extra, weapon_multiplier, ca_fixed")
print("已移除字段: 奥义cdr")
