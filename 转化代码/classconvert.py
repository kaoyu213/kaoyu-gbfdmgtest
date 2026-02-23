import pandas as pd
import json
import os

# --- 配置项 ---
INPUT_EXCEL = 'classes.xlsx'
OUTPUT_JSON = 'classes.json'

# --- 辅助函数：解析 KV 字符串 ---
def parse_kv_string(kv_str):
    if pd.isna(kv_str) or str(kv_str).strip() == "":
        return {}
    
    result = {}
    items = str(kv_str).split(',')
    
    for item in items:
        if ':' not in item:
            continue
        key, val = item.split(':', 1)
        key = key.strip()
        val = val.strip()
        
        try:
            if '%' in val:
                clean_val = float(val.replace('%', '')) / 100
                clean_val = round(clean_val, 4)
                result[key] = clean_val
            elif '.' in val:
                result[key] = float(val)
            else:
                result[key] = int(val)
        except ValueError:
            result[key] = val
    return result

def convert_excel_to_json():
    print(f"正在读取 {INPUT_EXCEL}...")
    
    try:
        df = pd.read_excel(INPUT_EXCEL, engine='openpyxl').fillna("")
    except FileNotFoundError:
        print(f"错误: 找不到文件 '{INPUT_EXCEL}'")
        return

    json_list = []

    # 定义需要合并的所有加成列
    bonus_source_columns = [
        'level_bonuses',        # 等级加成
        'master_level_bonuses', # 大师级加成
        'skill_bonuses',        # 被动技能 (原 support_skills)
        'ultimate_bonuses'      # 极致证加成 (New)
    ]

    for index, row in df.iterrows():
        if not row['id']:
            continue

        # 1. 基础信息处理
        prof_str = str(row['proficiency'])
        prof_array = [x.strip() for x in prof_str.split(',') if x.strip()]

        # 2. [核心逻辑] 汇总所有加成到一个字典
        merged_bonuses = {}

        # 2.1 先处理基础连击 (放入 chara_ta_base / chara_da_base)
        base_da = float(row.get('基础da', 0) or 0)
        base_ta = float(row.get('基础ta', 0) or 0)
        
        if base_da > 0:
            merged_bonuses['chara_da_base'] = base_da
        if base_ta > 0:
            merged_bonuses['chara_ta_base'] = base_ta

        # 2.2 遍历所有加成列并累加
        for col in bonus_source_columns:
            # 获取该列的数据并解析为字典
            col_data = parse_kv_string(row.get(col, ''))
            
            # 将解析出的数据累加到 merged_bonuses 中
            for k, v in col_data.items():
                current_val = merged_bonuses.get(k, 0)
                # 只有数字才累加，字符串直接覆盖
                if isinstance(v, (int, float)) and isinstance(current_val, (int, float)):
                    merged_bonuses[k] = round(current_val + v, 4)
                else:
                    merged_bonuses[k] = v

        # 3. 战斗效果描述 (battle_support)
        battle_support_text = str(row.get('battle_support', '')).strip()

        # 4. 构建最终对象
        char_data = {
            "id": str(row['id']).strip(),
            "name": str(row['name']).strip(),
            "proficiency": prof_array,
            "type": str(row['type']).strip(),
            "image": str(row['image']).strip(),
            "description": str(row['description']).strip(),
            
            "bonuses": merged_bonuses,          # 汇总后的面板加成
            "battle_bonuses": battle_support_text # 战斗效果文本
        }

        json_list.append(char_data)

    try:
        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(json_list, f, ensure_ascii=False, indent=2)
        print(f"转换成功！已生成 {len(json_list)} 条数据。")
        print("所有职业加成已自动汇总计算。")
    except Exception as e:
        print(f"写入 JSON 失败: {e}")

if __name__ == "__main__":
    convert_excel_to_json()