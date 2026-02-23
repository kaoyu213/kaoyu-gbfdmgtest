# -*- coding: utf-8 -*-
"""
技能Excel转JSON脚本
功能：将excel/skills.xlsx中的技能数据增量添加到0215 copy/skills.json

使用方法：
    python skill_excel_to_json.py

说明：
    - 只添加Excel中的新技能（按ID判断），不删除原有数据
    - 如果技能ID已存在，则跳过该技能
"""

import pandas as pd
import json
import os

# 文件路径配置
EXCEL_FILE = 'excel/skills.xlsx'
OUTPUT_FILE = '0215 copy/skills.json'


def load_existing_skills():
    """加载现有的技能数据"""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"警告：{OUTPUT_FILE} 不是有效的JSON文件，将创建新文件")
            return []
    return []


def convert_excel_to_skills():
    """将Excel转换为技能数据列表"""
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
    skills_list = []
    
    for index, row in df.iterrows():
        # 跳过ID为空的行
        if not row.get('ID') or str(row['ID']).strip() == '':
            continue
        
        skill_id = str(row['ID']).strip()
        
        skill_data = {
            "id": skill_id,
            "name": str(row.get('名称', '')).strip(),
            "description": str(row.get('描述', '')).strip(),
            "image": str(row.get('UI图标', '')).strip(),
            "element": str(row.get('元素', '')).strip(),
            "race": str(row.get('种族', '')).strip(),
            "position": str(row.get('位置', '')).strip(),
            "condition": str(row.get('触发条件', '')).strip(),
            "effects": []
        }
        
        # 处理效果（最多5个）
        for i in range(1, 6):
            prop_col = f'效果{i}_属性'
            boost_col = f'效果{i}_加成'
            value_col = f'效果{i}_数值'
            
            prop = str(row.get(prop_col, '')).strip()
            
            if prop != '':
                effect = {
                    "prop": prop,
                    "boost": str(row.get(boost_col, '')).strip(),
                    "value": str(row.get(value_col, '')).strip()
                }
                skill_data['effects'].append(effect)
        
        skills_list.append(skill_data)
    
    return skills_list


def main():
    print("=" * 50)
    print("技能Excel转JSON工具")
    print("=" * 50)
    
    # 加载现有技能数据
    existing_skills = load_existing_skills()
    existing_ids = {s['id'] for s in existing_skills}
    print(f"现有技能数量: {len(existing_skills)}")
    
    # 转换Excel数据
    new_skills = convert_excel_to_skills()
    if not new_skills:
        print("没有从Excel中找到任何技能数据")
        return
    
    # 筛选出Excel中的新技能（ID不存在于现有数据中的）
    skills_to_add = [s for s in new_skills if s['id'] not in existing_ids]
    
    if not skills_to_add:
        print("Excel中的所有技能已存在于现有数据中，无需添加")
        return
    
    print(f"Excel中的新技能数量: {len(skills_to_add)}")
    
    # 合并数据
    merged_skills = existing_skills + skills_to_add
    
    # 写入文件
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(merged_skills, f, ensure_ascii=False, indent=2)
        
        print(f"转换成功！")
        print(f"  - 新增技能: {len(skills_to_add)}")
        print(f"  - 总技能数: {len(merged_skills)}")
        print(f"  - 输出文件: {OUTPUT_FILE}")
        
        # 打印新增的技能名称
        print("\n新增技能列表:")
        for s in skills_to_add:
            print(f"  - [{s['id']}] {s['name']}")
        
    except Exception as e:
        print(f"写入文件失败: {e}")


if __name__ == "__main__":
    main()
