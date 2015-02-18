#include <config.h>

#include <stdio.h>
#include <unictype.h>

int
main (int argc, char **argv)
{
  const uc_script_t *scripts;
  const uc_block_t *blocks;
  size_t count, i;

#define PAIR(str) printf ("\
#. TRANSLATORS: this is a string from libunistring; you can skip it for now\n\
msgid \"%s\"\n\
msgstr \"\"\n\n", str)
  PAIR (uc_general_category_long_name (UC_CATEGORY_L));
  PAIR (uc_general_category_long_name (UC_CATEGORY_LC));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Lu));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Ll));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Lt));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Lm));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Lo));
  PAIR (uc_general_category_long_name (UC_CATEGORY_M));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Mn));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Mc));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Me));
  PAIR (uc_general_category_long_name (UC_CATEGORY_N));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Nd));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Nl));
  PAIR (uc_general_category_long_name (UC_CATEGORY_No));
  PAIR (uc_general_category_long_name (UC_CATEGORY_P));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Pc));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Pd));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Ps));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Pe));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Pi));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Pf));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Po));
  PAIR (uc_general_category_long_name (UC_CATEGORY_S));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Sm));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Sc));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Sk));
  PAIR (uc_general_category_long_name (UC_CATEGORY_So));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Z));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Zs));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Zl));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Zp));
  PAIR (uc_general_category_long_name (UC_CATEGORY_C));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Cc));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Cf));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Cs));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Co));
  PAIR (uc_general_category_long_name (UC_CATEGORY_Cn));

  uc_all_scripts (&scripts, &count);
  for (i = 0; i < count; i++)
    PAIR (scripts[i].name);

  uc_all_blocks (&blocks, &count);
  for (i = 0; i < count; i++)
    PAIR (blocks[i].name);
#undef PAIR

  return 0;
}
