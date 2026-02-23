# -*- coding: utf-8 -*-
"""
武器Excel转JSON脚本
功能：将excel/weapon.xlsx中的武器数据增量添加到0215 copy/weapons.json

使用方法：
    python weapon_excel_to_json.py

说明：
    - 只添加Excel中的新武器（按ID判断），不删除原有数据
    - 如果武器ID已存在，则跳过该武器
"""

import pandas as pd
import json
import os

# 文件路径配置
EXCEL_FILE = 'excel/weapon.xlsx'
OUTPUT_FILE = '0215 copy/weapons.json'


def safe_int(val, default=0):
    """安全转换为整数"""
    try:
        if pd.isna(val) or val == '':
            return default
        return int(float(val))
    except:
        return default


def safe_float(val, default=0.0):
    """安全转换为浮点数"""
    try:
        if pd.isna(val) or val == '':
            return default
        return float(val)
    except:
        return default


def load_existing_weapons():
    """加载现有的武器数据"""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"警告：{OUTPUT_FILE} 不是有效的JSON文件，将创建新文件")
            return []
    return []


def convert_excel_to_weapons():
    """将Excel转换为武器数据列表"""
    print(f"正在读取文件: {EXCEL_FILE} ...")
    
    if not os.path.exists(EXCEL_FILE):
        print(f"错误：找不到文件 {EXCEL_FILE}")
        return []
    
    try:
        df = pd.read_excel(EXCEL_FILE, dtype=str)
    except Exception as e:
        print(f"读取Excel失败: {e}")
        return []
    
    df = df.fillna('')
    weapons_list = []
    
    for index, row in df.iterrows():
        # 跳过ID为空的行
        if not row.get('ID') or str(row['ID']).strip() == '':
            continue
        
        weapon_id = str(row['ID']).strip()
        
        weapon_data = {
            "id": weapon_id,
            "name": str(row.get('中文名', '')).strip(),
            "type": str(row.get('种类', '')).strip(),
            "element": str(row.get('属性', '')).strip(),
            "category": str(row.get('武器分类', '')).strip(),
            "image": str(row.get('UI图标', '')).strip(),
            "stats": {
                "hp": safe_int(row.get('最大HP', 0)),
                "atk": safe_int(row.get('最大ATK', 0)),
                "max_level": safe_int(row.get('最大等级', 100), 100),
                "allow_extra": str(row.get('allow_extra', 'False')).strip().lower() == 'true',
                "weapon_multiplier": safe_float(row.get('weapon_multiplier', 1.0), 1.0),
                "ca_fixed": safe_int(row.get('ca_fixed', 0), 0)
            },
            "skill_slots": []
        }
        
        # 处理技能槽（最多5个）
        for i in range(1, 6):
            skill_id_col = f'技能{i}_ID'
            unlock_col = f'技能{i}_解锁等级'
            
            if skill_id_col in df.columns:
                raw_val = str(row.get(skill_id_col, '')).strip()
                
                if raw_val != '':
                    # 检查是否是可选技能（用逗号分隔多个技能ID）
                    if ',' in raw_val or '，' in raw_val:
                        # 可选技能槽
                        options_list = [x.strip() for x in raw_val.replace('，', ',').split(',') if x.strip()]
                        skill_entry = {
                            "is_slot": True,
                            "options": options_list,
                            "unlock_level": safe_int(row.get(unlock_col, 0), 0)
                        }
                    else:
                        # 固定技能
                        skill_entry = {
                            "is_slot": False,
                            "skill_id": raw_val,
                            "unlock_level": safe_int(row.get(unlock_col, 0), 0)
                        }
                    
                    weapon_data['skill_slots'].append(skill_entry)
        
        weapons_list.append(weapon_data)
    
    return weapons_list


def main():
    print("=" * 50)
    print("武器Excel转JSON工具")
    print("=" * 50)
    
    # 加载现有武器数据
    existing_weapons = load_existing_weapons()
    existing_ids = {w['id'] for w in existing_weapons}
    print(f"现有武器数量: {len(existing_weapons)}")
    
    # 转换Excel数据
    new_weapons = convert_excel_to_weapons()
    if not new_weapons:
        print("没有从Excel中找到任何武器数据")
        return
    
    # 筛选出Excel中的新武器（ID不存在于现有数据中的）
    weapons_to_add = [w for w in new_weapons if w['id'] not in existing_ids]
    
    if not weapons_to_add:
        print("Excel中的所有武器已存在于现有数据中，无需添加")
        return
    
    print(f"Excel中的新武器数量: {len(weapons_to_add)}")
    
    # 合并数据
    merged_weapons = existing_weapons + weapons_to_add
    
    # 写入文件
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(merged_weapons, f, ensure_ascii=False, indent=2)
        
        print(f"转换成功！")
        print(f"  - 新增武器: {len(weapons_to_add)}")
        print(f"  - 总武器数: {len(merged_weapons)}")
        print(f"  - 输出文件: {OUTPUT_FILE}")
        
        # 打印新增的武器名称
        print("\n新增武器列表:")
        for w in weapons_to_add:
            print(f"  - [{w['id']}] {w['name']}")
        
    except Exception as e:
        print(f"写入文件失败: {e}")


if __name__ == "__main__":
    main()
